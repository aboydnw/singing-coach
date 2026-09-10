import { describe, expect, it, vi } from "vitest";
import { playReference } from "@/lib/referencePlayback";
import type { ExerciseSpec } from "@/lib/schema";

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

describe("playReference", () => {
  it("plays reviewed vocal audio", async () => {
    const playAudio = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    const playPitch = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));

    await expect(playReference(spec(), { playAudio, playPitch }).done).resolves.toBe(
      "vocal",
    );
    expect(playAudio).toHaveBeenCalledWith("/audio/activities/example.wav");
    expect(playPitch).not.toHaveBeenCalled();
  });

  it("falls back when vocal playback fails", async () => {
    const playPitch = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    const player = playReference(spec(), {
      playAudio: () => ({
        done: Promise.reject(new Error("load failed")),
        stop: vi.fn(),
      }),
      playPitch,
    });

    await expect(player.done).resolves.toBe("pitch_fallback");
    expect(playPitch).toHaveBeenCalled();
  });

  it("ignores unreviewed audio", async () => {
    const playAudio = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    const playPitch = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));

    await expect(playReference(spec(false), { playAudio, playPitch }).done).resolves.toBe(
      "pitch_fallback",
    );
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("selects only the asset for the resolved transposition", async () => {
    const value = spec();
    value.transposition_semitones = 2;
    value.reference_audio = [
      ...value.reference_audio!,
      { ...value.reference_audio![0], semitones: 2, src: "/audio/activities/p2.wav" },
    ];
    const playAudio = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    await playReference(value, {
      playAudio,
      playPitch: () => ({ done: Promise.resolve(), stop: vi.fn() }),
    }).done;
    expect(playAudio).toHaveBeenCalledWith("/audio/activities/p2.wav");
  });

  it("uses timed events for fallback playback", async () => {
    const value = {
      ...spec(false),
      events: [
        { kind: "note" as const, midi: 60, duration_s: 0.25, syllable: "ah" },
        { kind: "rest" as const, duration_s: 0.5 },
      ],
    };
    const playTimedPitch = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    await playReference(value, {
      playAudio: () => ({ done: Promise.resolve(), stop: vi.fn() }),
      playPitch: () => ({ done: Promise.resolve(), stop: vi.fn() }),
      playTimedPitch,
    }).done;
    expect(playTimedPitch).toHaveBeenCalledWith(value.events);
  });
});
