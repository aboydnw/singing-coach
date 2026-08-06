import { describe, expect, it } from "vitest";
import {
  GHOST_CONTOUR_POINTS,
  bestPriorTake,
  decimateContour,
  type SessionRow,
} from "@/lib/sessions";
import type { Contour, ExerciseSpec } from "@/lib/schema";

const SPEC: ExerciseSpec = {
  type: "scale",
  target_notes_midi: [60, 62, 64, 65, 67],
  duration_per_note_s: 0.5,
  vowel: "ah",
  display_name: "scale on 'ah', starting C4",
};

function contour(n: number): Contour {
  return {
    times: Array.from({ length: n }, (_, i) => i * 0.01),
    f0_midi: Array.from({ length: n }, (_, i) => 60 + (i % 5)),
    confidence: Array.from({ length: n }, () => 0.9),
  };
}

function row(overrides: Partial<SessionRow> & { id: string }): SessionRow {
  return {
    ts: "2026-07-22T10:00:00.000Z",
    exercise_type: SPEC.type,
    exercise_spec_json: JSON.stringify(SPEC),
    measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 30 } }),
    coaching_md: "",
    coaching_json: null,
    audio_key: "uid/a.wav",
    contour_json: JSON.stringify(contour(50)),
    ...overrides,
  };
}

describe("decimateContour", () => {
  it("leaves a short contour alone", () => {
    const short = contour(10);
    expect(decimateContour(short)).toEqual(short);
  });

  it("thins a long contour to the cap", () => {
    expect(decimateContour(contour(5000)).times).toHaveLength(GHOST_CONTOUR_POINTS);
  });

  it("keeps all three arrays the same length", () => {
    const thinned = decimateContour(contour(5000));
    expect(thinned.f0_midi).toHaveLength(thinned.times.length);
    expect(thinned.confidence).toHaveLength(thinned.times.length);
  });

  it("keeps the contour spanning the same stretch of time", () => {
    const thinned = decimateContour(contour(5000));
    expect(thinned.times[0]).toBe(0);
    expect(thinned.times[thinned.times.length - 1]).toBeGreaterThan(49);
  });
});

describe("bestPriorTake", () => {
  it("returns nothing when free-singing", () => {
    expect(bestPriorTake([row({ id: "a" })], null)).toBeNull();
  });

  it("returns nothing when there is no prior take", () => {
    expect(bestPriorTake([], SPEC)).toBeNull();
  });

  it("picks the take with the lowest cents off", () => {
    const rows = [
      row({
        id: "a",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 40 } }),
      }),
      row({
        id: "b",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 12 } }),
      }),
    ];
    expect(bestPriorTake(rows, SPEC)?.meanAbsCentsOff).toBe(12);
  });

  it("breaks a tie toward the more recent take", () => {
    const rows = [
      row({ id: "older", ts: "2026-07-01T10:00:00.000Z" }),
      row({ id: "newer", ts: "2026-07-30T10:00:00.000Z" }),
    ];
    expect(bestPriorTake(rows, SPEC)?.ts).toBe("2026-07-30T10:00:00.000Z");
  });

  it("breaks a tie toward the more recent take whatever order rows arrive in", () => {
    const rows = [
      row({ id: "newer", ts: "2026-07-30T10:00:00.000Z" }),
      row({ id: "older", ts: "2026-07-01T10:00:00.000Z" }),
    ];
    expect(bestPriorTake(rows, SPEC)?.ts).toBe("2026-07-30T10:00:00.000Z");
  });

  it("still prefers a better score over a newer one", () => {
    const rows = [
      row({
        id: "newer-worse",
        ts: "2026-07-30T10:00:00.000Z",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 40 } }),
      }),
      row({
        id: "older-better",
        ts: "2026-07-01T10:00:00.000Z",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 9 } }),
      }),
    ];
    expect(bestPriorTake(rows, SPEC)?.meanAbsCentsOff).toBe(9);
  });

  it("excludes the session being scored right now", () => {
    const rows = [
      row({
        id: "current",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 5 } }),
      }),
      row({
        id: "older",
        measurements_json: JSON.stringify({ accuracy: { mean_abs_cents_off: 20 } }),
      }),
    ];
    expect(bestPriorTake(rows, SPEC, "current")?.meanAbsCentsOff).toBe(20);
  });

  it("ignores takes of a different exercise type", () => {
    expect(bestPriorTake([row({ id: "a", exercise_type: "siren" })], SPEC)).toBeNull();
  });

  it("ignores takes of the same type on different notes", () => {
    const other = { ...SPEC, target_notes_midi: [65, 67, 69, 70, 72] };
    const rows = [row({ id: "a", exercise_spec_json: JSON.stringify(other) })];
    expect(bestPriorTake(rows, SPEC)).toBeNull();
  });

  it("ignores rows saved before contours were stored", () => {
    expect(bestPriorTake([row({ id: "a", contour_json: null })], SPEC)).toBeNull();
  });

  it("ignores rows with no accuracy score to rank by", () => {
    const rows = [row({ id: "a", measurements_json: JSON.stringify({}) })];
    expect(bestPriorTake(rows, SPEC)).toBeNull();
  });

  it("ignores a corrupt contour rather than throwing", () => {
    expect(bestPriorTake([row({ id: "a", contour_json: "{oops" })], SPEC)).toBeNull();
  });
});
