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
        voice: "demo",
        license: "CC-BY-4.0",
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
      playAudio: () => ({ done: Promise.reject(new Error("load failed")), stop: vi.fn() }),
      playPitch,
    });

    await expect(player.done).resolves.toBe("pitch_fallback");
    expect(playPitch).toHaveBeenCalled();
  });

  it("ignores unreviewed audio", async () => {
    const playAudio = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    const playPitch = vi.fn(() => ({ done: Promise.resolve(), stop: vi.fn() }));

    await expect(
      playReference(spec(false), { playAudio, playPitch }).done,
    ).resolves.toBe("pitch_fallback");
    expect(playAudio).not.toHaveBeenCalled();
  });
});
