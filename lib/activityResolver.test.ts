import { describe, expect, it } from "vitest";
import { findActivity } from "@/lib/activityCatalogue";
import {
  resolveActivity,
  safeActivityTranspositions,
} from "@/lib/activityResolver";
import type { Calibration } from "@/lib/schema";

const CALIBRATION: Calibration = {
  range_low_midi: 48,
  range_high_midi: 72,
  tessitura_low_midi: 55,
  tessitura_high_midi: 65,
};

describe("activity resolution", () => {
  it("preserves unequal timing and flattens only note targets", () => {
    const activity = findActivity("staccato_onsets.basic")!;
    const spec = resolveActivity(activity, CALIBRATION, 0)!;

    expect(spec.events?.map((event) => event.duration_s)).toContain(0.3);
    expect(spec.target_notes_midi).toEqual([60, 60, 60, 60, 60]);
    expect(spec.activity_id).toBe(activity.id);
  });

  it("rejects a transposition outside the calibrated range", () => {
    const activity = findActivity("twang_meow.basic")!;
    expect(resolveActivity(activity, CALIBRATION, 2)).toBeNull();
  });

  it("returns only safe members of the seven planned offsets", () => {
    const activity = findActivity("twang_meow.basic")!;
    const resolved = safeActivityTranspositions(activity, CALIBRATION);

    expect(resolved.map((item) => item.semitones)).toEqual([-6, -4, -2, 0]);
    for (const item of resolved) {
      expect(Math.min(...item.spec.target_notes_midi)).toBeGreaterThanOrEqual(48);
      expect(Math.max(...item.spec.target_notes_midi)).toBeLessThanOrEqual(72);
    }
  });

  it("returns null for a guided unscored activity", () => {
    expect(
      resolveActivity(
        findActivity("voiced_fricative_ladder.basic")!,
        CALIBRATION,
        0,
      ),
    ).toBeNull();
  });
});
