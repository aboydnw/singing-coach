import { describe, expect, it } from "vitest";
import coaching from "../prompts/coaching.json";
import {
  coachingModelOutputSchema,
  coachingResultSchema,
  FOCUS_AREAS,
  measurementsSchema,
} from "./schema";

describe("focus area enum", () => {
  it("comes from prompts/coaching.json, the single source of truth", () => {
    expect(FOCUS_AREAS).toEqual(coaching.schema.properties.focus_area.enum);
    expect(FOCUS_AREAS.length).toBeGreaterThan(0);
  });

  it("rejects a coaching result with an unknown focus area", () => {
    const result = coachingResultSchema.safeParse({
      focus_area: "posture",
      // Valid so that the focus area is the only reason this can fail.
      state_id: "hypoadduction",
      drill_id: "staccato_onsets",
      top_issue: "x",
      why: "y",
      drill: "z",
      encouragement: "w",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a coaching result with every known focus area", () => {
    for (const area of FOCUS_AREAS) {
      const result = coachingResultSchema.safeParse({
        focus_area: area,
        state_id: "hypoadduction",
        drill_id: "staccato_onsets",
        top_issue: "x",
        why: "y",
        drill: "z",
        encouragement: "w",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a coaching result with no state or drill chosen", () => {
    const result = coachingResultSchema.safeParse({
      focus_area: FOCUS_AREAS[0],
      top_issue: "x",
      why: "y",
      drill: "z",
      encouragement: "w",
    });
    expect(result.success).toBe(false);
  });

  // The model output schema is deliberately looser than the response schema:
  // a provider that ignores strict mode should reach the fallback rather than
  // fail validation and cost the singer their coaching.
  it("accepts model output that omits the identifiers", () => {
    const result = coachingModelOutputSchema.safeParse({
      focus_area: FOCUS_AREAS[0],
      top_issue: "x",
      why: "y",
      drill: "z",
      encouragement: "w",
    });
    expect(result.success).toBe(true);
  });

  it("still rejects model output with an unknown focus area", () => {
    const result = coachingModelOutputSchema.safeParse({
      focus_area: "posture",
      top_issue: "x",
      why: "y",
      drill: "z",
      encouragement: "w",
    });
    expect(result.success).toBe(false);
  });
});

describe("measurements schema", () => {
  it("mirrors models.py field-for-field", () => {
    const parsed = measurementsSchema.parse({
      jitter_local: 0.005,
      shimmer_local: null,
      hnr_mean: 22.1,
      vibrato_rate_hz: 5.5,
      vibrato_extent_cents: 60,
      f1_mean: null,
      f2_mean: null,
      accuracy: {
        per_note: [{ target_midi: 60, target_name: "C4", cents_off: -12.5 }],
        mean_abs_cents_off: 12.5,
      },
    });
    expect(parsed.accuracy?.per_note[0].target_name).toBe("C4");
  });
});
