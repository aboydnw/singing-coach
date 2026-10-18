import {
  renderSequenceWav,
  renderTimedSequenceWav,
  type TimedToneEvent,
} from "@/lib/referenceTone";
import { isActivityAudioPath, type ExerciseSpec } from "@/lib/schema";

export type ReferenceSource = "vocal" | "pitch_fallback";
export type ReferencePlayer = {
  started: Promise<ReferenceSource>;
  done: Promise<ReferenceSource>;
  stop: () => void;
};

export type MediaLike = {
  play: () => Promise<void>;
  pause: () => void;
  currentTime: number;
  addEventListener: (
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ) => void;
};

export type ReferencePlaybackDependencies = {
  createAudio: (src: string) => MediaLike;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  renderSequence: typeof renderSequenceWav;
  renderTimed: typeof renderTimedSequenceWav;
};

type MediaPlayer = {
  started: Promise<void>;
  done: Promise<void>;
  stop: () => void;
};

export function playReference(
  spec: ExerciseSpec,
  dependencies: ReferencePlaybackDependencies = browserDependencies,
): ReferencePlayer {
  const started = deferred<ReferenceSource>();
  const done = deferred<ReferenceSource>();
  let active: MediaPlayer | null = null;
  let activeSource: ReferenceSource = "pitch_fallback";
  let stopped = false;

  const run = async () => {
    const transposition = spec.transposition_semitones ?? 0;
    const vocal = spec.reference_audio?.find(
      (reference) =>
        reference.reviewed &&
        reference.semitones === transposition &&
        isActivityAudioPath(reference.src),
    );

    if (vocal) {
      activeSource = "vocal";
      const vocalPlayer = playMedia(vocal.src, undefined, dependencies);
      active = vocalPlayer;
      void vocalPlayer.done.catch(() => undefined);
      try {
        await vocalPlayer.started;
        if (stopped) return;
        started.resolve("vocal");
        await vocalPlayer.done;
        if (!stopped) done.resolve("vocal");
        return;
      } catch {
        if (stopped) return;
      }
    }

    activeSource = "pitch_fallback";
    const blob = spec.events
      ? dependencies.renderTimed(spec.events as TimedToneEvent[])
      : dependencies.renderSequence(spec.target_notes_midi, spec.duration_per_note_s);
    const objectUrl = dependencies.createObjectURL(blob);
    const pitchPlayer = playMedia(
      objectUrl,
      () => dependencies.revokeObjectURL(objectUrl),
      dependencies,
    );
    active = pitchPlayer;
    void pitchPlayer.done.catch(() => undefined);
    try {
      await pitchPlayer.started;
      if (stopped) return;
      started.resolve("pitch_fallback");
      await pitchPlayer.done;
      if (!stopped) done.resolve("pitch_fallback");
    } catch (error) {
      if (!stopped) {
        started.reject(error);
        done.reject(error);
      }
    }
  };

  void run().catch((error) => {
    if (!stopped) {
      started.reject(error);
      done.reject(error);
    }
  });

  return {
    started: started.promise,
    done: done.promise,
    stop: () => {
      if (stopped) return;
      stopped = true;
      active?.stop();
      started.reject(new Error("reference playback stopped"));
      done.resolve(activeSource);
    },
  };
}

function playMedia(
  src: string,
  cleanup: (() => void) | undefined,
  dependencies: ReferencePlaybackDependencies,
): MediaPlayer {
  const audio = dependencies.createAudio(src);
  const started = deferred<void>();
  const done = deferred<void>();
  let finished = false;

  const finish = (outcome: "ended" | "stopped" | "error", error?: unknown) => {
    if (finished) return;
    finished = true;
    if (outcome !== "ended") {
      audio.pause();
      audio.currentTime = 0;
    }
    cleanup?.();
    if (outcome === "error") {
      started.reject(error);
      done.reject(error);
    } else {
      if (outcome === "stopped") {
        started.reject(new Error("reference playback stopped"));
      }
      done.resolve();
    }
  };

  audio.addEventListener("ended", () => finish("ended"), { once: true });
  audio.addEventListener(
    "error",
    () => finish("error", new Error("reference audio failed to load")),
    { once: true },
  );
  void audio
    .play()
    .then(started.resolve)
    .catch((error) => finish("error", error));

  return {
    started: started.promise,
    done: done.promise,
    stop: () => finish("stopped"),
  };
}

function deferred<T>() {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
    reject: (reason: unknown) => {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    },
  };
}

const browserDependencies: ReferencePlaybackDependencies = {
  createAudio: (src) => new Audio(src),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  renderSequence: renderSequenceWav,
  renderTimed: renderTimedSequenceWav,
};
