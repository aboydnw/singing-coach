import type { ExerciseSpec } from "@/lib/schema";
import { playSequence, playTimedSequence } from "@/lib/toneGen";

type Player = { done: Promise<void>; stop: () => void };
type PlaybackDependencies = {
  playAudio: (src: string) => Player;
  playPitch: (spec: ExerciseSpec) => Player;
  playTimedPitch?: (events: NonNullable<ExerciseSpec["events"]>) => Player;
};

export function playReference(
  spec: ExerciseSpec,
  dependencies: PlaybackDependencies = browserDependencies,
): { done: Promise<"vocal" | "pitch_fallback">; stop: () => void } {
  let active: Player | null = null;
  let stopped = false;
  const transposition = spec.transposition_semitones ?? 0;
  const vocal = spec.reference_audio?.find(
    (reference) =>
      reference.reviewed &&
      reference.semitones === transposition &&
      reference.src.startsWith("/audio/activities/"),
  );

  const done = (async () => {
    if (vocal) {
      try {
        active = dependencies.playAudio(vocal.src);
        await active.done;
        return "vocal" as const;
      } catch {
        if (stopped) return "vocal" as const;
      }
    }
    active =
      spec.events && dependencies.playTimedPitch
        ? dependencies.playTimedPitch(spec.events)
        : dependencies.playPitch(spec);
    await active.done;
    return "pitch_fallback" as const;
  })();

  return {
    done,
    stop: () => {
      stopped = true;
      active?.stop();
    },
  };
}

const browserDependencies: PlaybackDependencies = {
  playAudio: (src) => {
    const audio = new Audio(src);
    const done = new Promise<void>((resolve, reject) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("audio failed to load")), {
        once: true,
      });
      void audio.play().catch(reject);
    });
    return { done, stop: () => audio.pause() };
  },
  playPitch: (spec) => playSequence(spec.target_notes_midi, spec.duration_per_note_s),
  playTimedPitch: (events) => playTimedSequence(events),
};
