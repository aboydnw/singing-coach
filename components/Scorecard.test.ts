import { describe, expect, it } from "vitest";
import { buildRows } from "./Scorecard";
import type { Measurements } from "@/lib/schema";

const HEALTHY: Measurements = {
  jitter_local: 0.006,
  shimmer_local: 0.03,
  hnr_mean: 24.0,
  vibrato_rate_hz: 5.6,
  vibrato_extent_cents: 60.0,
  f1_mean: 700.0,
  f2_mean: 1200.0,
  accuracy: {
    per_note: [{ target_midi: 60, target_name: "C4", cents_off: 10.0 }],
    mean_abs_cents_off: 10.0,
  },
};

function levelOf(m: Measurements, label: string): string | undefined {
  return buildRows(m).find((r) => r.label === label)?.level;
}

describe("scorecard thresholds (pinned to _metrics_markdown's values)", () => {
  it.each([
    [10, "good"],
    [25, "good"],
    [26, "watch"],
    [50, "watch"],
    [51, "work"],
  ])("pitch accuracy at %s cents is %s", (cents, level) => {
    const m = {
      ...HEALTHY,
      accuracy: { per_note: [], mean_abs_cents_off: cents },
    };
    expect(levelOf(m, "Pitch accuracy")).toBe(level);
  });

  it.each([
    [0.01, "good"],
    [0.015, "watch"],
    [0.021, "work"],
  ])("jitter %s is %s", (jitter, level) => {
    expect(
      levelOf({ ...HEALTHY, jitter_local: jitter }, "Pitch steadiness (jitter)"),
    ).toBe(level);
  });

  it.each([
    [0.05, "good"],
    [0.08, "watch"],
    [0.11, "work"],
  ])("shimmer %s is %s", (shimmer, level) => {
    expect(
      levelOf({ ...HEALTHY, shimmer_local: shimmer }, "Volume steadiness (shimmer)"),
    ).toBe(level);
  });

  it.each([
    [20, "good"],
    [15, "watch"],
    [14.9, "work"],
  ])("HNR %s dB is %s", (hnr, level) => {
    expect(levelOf({ ...HEALTHY, hnr_mean: hnr }, "Tone clarity (HNR)")).toBe(level);
  });

  it("treats extent under 20 cents as minimal vibrato, not a graded row", () => {
    const rows = buildRows({ ...HEALTHY, vibrato_extent_cents: 15 });
    expect(rows.find((r) => r.label === "Vibrato")?.value).toBe(
      "minimal / straight tone",
    );
    expect(rows.find((r) => r.label === "Vibrato rate")).toBeUndefined();
  });

  it.each([
    [5.0, "good"],
    [6.5, "good"],
    [4.5, "watch"],
    [7.5, "work"],
  ])("vibrato rate %s Hz is %s", (rate, level) => {
    expect(levelOf({ ...HEALTHY, vibrato_rate_hz: rate }, "Vibrato rate")).toBe(level);
  });

  it.each([
    [50, "good"],
    [100, "good"],
    [30, "watch"],
    [130, "work"],
  ])("vibrato depth %s cents is %s", (extent, level) => {
    expect(levelOf({ ...HEALTHY, vibrato_extent_cents: extent }, "Vibrato depth")).toBe(
      level,
    );
  });

  it("omits rows for missing metrics instead of guessing", () => {
    const rows = buildRows({
      ...HEALTHY,
      jitter_local: null,
      accuracy: null,
    });
    expect(rows.find((r) => r.label === "Pitch steadiness (jitter)")).toBeUndefined();
    expect(rows.find((r) => r.label === "Pitch accuracy")).toBeUndefined();
  });
});
