import { describe, expect, it } from "vitest";
import { PASSAGES } from "@/lib/repertoireCatalogue";
import {
  resolvePassage,
  safePassageTranspositions,
  selectSongPassage,
  shiftSongKey,
} from "@/lib/repertoireResolver";
import type { Calibration } from "@/lib/schema";

const midVoice: Calibration = {
  range_low_midi: 48,
  range_high_midi: 72,
  tessitura_low_midi: 52,
  tessitura_high_midi: 67,
};

describe("repertoire resolver", () => {
  it("resolves lyric events and retains source provenance", () => {
    const spec = resolvePassage(PASSAGES[0], midVoice, 0);
    expect(spec?.activity_kind).toBe("song_passage");
    expect(spec?.excerpt).toBe(PASSAGES[0].excerpt);
    expect(spec?.source?.public_domain_basis).toMatch(/public[- ]domain/);
    expect(spec?.events?.filter((event) => event.kind === "note").length).toBe(
      spec?.target_notes_midi.length,
    );
    expect(Math.min(...spec!.target_notes_midi)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...spec!.target_notes_midi)).toBeLessThanOrEqual(72);
  });

  it("offers only the standard safe key offsets", () => {
    const resolved = safePassageTranspositions(PASSAGES[1], midVoice);
    expect(resolved.length).toBeGreaterThan(1);
    expect(
      resolved
        .map((item) => item.semitones)
        .every((value) => [-6, -4, -2, 0, 2, 4, 6].includes(value)),
    ).toBe(true);
  });

  it("avoids a recently used song when another matching passage fits", () => {
    const first = selectSongPassage({
      calibration: midVoice,
      focusArea: "pitch_accuracy",
      history: [],
    });
    const second = selectSongPassage({
      calibration: midVoice,
      focusArea: "pitch_accuracy",
      history: [{ exercise_spec_json: JSON.stringify(first!.spec) }],
    });
    expect(second?.spec.activity_id).not.toBe(first?.spec.activity_id);
  });

  it("moves one available stored key at a time and stops at boundaries", () => {
    const selected = selectSongPassage({
      calibration: midVoice,
      focusArea: "pitch_accuracy",
      history: [],
    })!;
    const higher = shiftSongKey(selected, "higher");
    expect(higher?.spec.transposition_semitones).toBeGreaterThan(
      selected.spec.transposition_semitones!,
    );
    const top = { ...selected, selectedIndex: selected.options.length - 1 };
    expect(shiftSongKey(top, "higher")).toBeNull();
  });
});
