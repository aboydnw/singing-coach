import { describe, expect, it, vi } from "vitest";
import {
  playReference,
  type MediaLike,
  type ReferencePlaybackDependencies,
} from "@/lib/referencePlayback";
import type { ExerciseSpec } from "@/lib/schema";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

class FakeAudio implements MediaLike {
  currentTime = 12;
  readonly pause = vi.fn();
  readonly playGate = deferred<void>();
  readonly listeners = new Map<string, Array<() => void>>();

  play = vi.fn(() => this.playGate.promise);

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: "ended" | "error"): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function spec(reviewed = true): ExerciseSpec {
  return {
    type: "sustained",
    target_notes_midi: [60],
    duration_per_note_s: 1,
    vowel: "ah",
    display_name: "Sustained ah",
    reference_audio: [
      {
        semitones: 0,
        src: "/audio/activities/example.wav",
        engine: "DiffSinger",
        model: "model",
        voicebank: "demo",
        dataset: "dataset",
        output_license: "CC-BY-4.0",
        reviewed,
      },
    ],
  };
}

function harness() {
  const audioBySource = new Map<string, FakeAudio>();
  const renderSequence = vi.fn(() => new Blob(["pitch"], { type: "audio/wav" }));
  const renderTimed = vi.fn(() => new Blob(["timed"], { type: "audio/wav" }));
  const dependencies: ReferencePlaybackDependencies = {
    createAudio: vi.fn((src) => {
      const audio = new FakeAudio();
      audioBySource.set(src, audio);
      return audio;
    }),
    createObjectURL: vi.fn(() => "blob:pitch-reference"),
    revokeObjectURL: vi.fn(),
    renderSequence,
    renderTimed,
  };
  return { dependencies, audioBySource, renderSequence, renderTimed };
}

describe("playReference", () => {
  it("confirms reviewed vocal audio only after media playback starts", async () => {
    const { dependencies, audioBySource, renderSequence } = harness();
    const player = playReference(spec(), dependencies);
    const audio = audioBySource.get("/audio/activities/example.wav")!;

    audio.playGate.resolve();
    await expect(player.started).resolves.toBe("vocal");
    expect(renderSequence).not.toHaveBeenCalled();

    audio.emit("ended");
    await expect(player.done).resolves.toBe("vocal");
  });

  it("falls back to a generated WAV when vocal playback cannot start", async () => {
    const { dependencies, audioBySource, renderSequence } = harness();
    const player = playReference(spec(), dependencies);
    const vocal = audioBySource.get("/audio/activities/example.wav")!;

    vocal.playGate.reject(new Error("blocked"));
    await vi.waitFor(() =>
      expect(audioBySource.get("blob:pitch-reference")).toBeDefined(),
    );
    const pitch = audioBySource.get("blob:pitch-reference")!;
    pitch.playGate.resolve();

    await expect(player.started).resolves.toBe("pitch_fallback");
    expect(renderSequence).toHaveBeenCalledWith([60], 1);
    pitch.emit("ended");
    await expect(player.done).resolves.toBe("pitch_fallback");
    expect(dependencies.revokeObjectURL).toHaveBeenCalledWith("blob:pitch-reference");
  });

  it("uses a generated WAV immediately when vocal audio is unreviewed", async () => {
    const { dependencies, audioBySource } = harness();
    const player = playReference(spec(false), dependencies);
    const pitch = audioBySource.get("blob:pitch-reference")!;

    pitch.playGate.resolve();
    await expect(player.started).resolves.toBe("pitch_fallback");
    expect(dependencies.createAudio).not.toHaveBeenCalledWith(
      "/audio/activities/example.wav",
    );
    pitch.emit("ended");
    await player.done;
  });

  it("selects only the reviewed vocal asset for the resolved transposition", async () => {
    const value = spec();
    value.transposition_semitones = 2;
    value.reference_audio = [
      ...value.reference_audio!,
      { ...value.reference_audio![0], semitones: 2, src: "/audio/activities/p2.wav" },
    ];
    const { dependencies, audioBySource } = harness();
    const player = playReference(value, dependencies);
    const audio = audioBySource.get("/audio/activities/p2.wav")!;

    audio.playGate.resolve();
    await player.started;
    expect(dependencies.createAudio).not.toHaveBeenCalledWith(
      "/audio/activities/example.wav",
    );
    audio.emit("ended");
    await player.done;
  });

  it("renders timed note and rest events into the pitch fallback", async () => {
    const value = {
      ...spec(false),
      events: [
        { kind: "note" as const, midi: 60, duration_s: 0.25, syllable: "ah" },
        { kind: "rest" as const, duration_s: 0.5 },
      ],
    };
    const { dependencies, audioBySource, renderTimed } = harness();
    const player = playReference(value, dependencies);
    const pitch = audioBySource.get("blob:pitch-reference")!;

    pitch.playGate.resolve();
    await player.started;
    expect(renderTimed).toHaveBeenCalledWith(value.events);
    pitch.emit("ended");
    await player.done;
  });

  it("stops media, resets time, and cleans an object URL exactly once", async () => {
    const { dependencies, audioBySource } = harness();
    const player = playReference(spec(false), dependencies);
    const pitch = audioBySource.get("blob:pitch-reference")!;
    pitch.playGate.resolve();
    await player.started;

    player.stop();
    player.stop();
    await expect(player.done).resolves.toBe("pitch_fallback");

    expect(pitch.pause).toHaveBeenCalledTimes(1);
    expect(pitch.currentTime).toBe(0);
    expect(dependencies.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not begin a fallback after stopping vocal preparation", async () => {
    const { dependencies, audioBySource, renderSequence } = harness();
    const player = playReference(spec(), dependencies);
    const vocal = audioBySource.get("/audio/activities/example.wav")!;

    player.stop();
    vocal.playGate.reject(new Error("cancelled"));

    await expect(player.started).rejects.toThrow("stopped");
    await expect(player.done).resolves.toBe("vocal");
    expect(renderSequence).not.toHaveBeenCalled();
  });

  it("rejects when generated pitch media cannot start", async () => {
    const { dependencies, audioBySource } = harness();
    const player = playReference(spec(false), dependencies);
    audioBySource.get("blob:pitch-reference")!.playGate.reject(new Error("blocked"));

    await expect(player.started).rejects.toThrow("blocked");
    await expect(player.done).rejects.toThrow("blocked");
    expect(dependencies.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
