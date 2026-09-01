import { describe, expect, it } from "vitest";
import coaching from "../prompts/coaching.json";
import {
  compassModelSchema,
  coachingModelOutputSchema,
  coachingResponseSchema,
  coachingResultSchema,
  FOCUS_AREAS,
  measurementsSchema,
} from "./schema";

const compass = {
  overall_trend: "Pitch starts are becoming more consistent across practices.",
  current_session: "Today's retries moved closer to the target.",
  next_direction: "Keep the cleaner onset while changing notes.",
};

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
      compass,
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
        compass,
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
      compass,
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
      compass,
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
      compass,
    });
    expect(result.success).toBe(false);
  });
});

describe("practice Compass schema", () => {
  it("requires the cross-session trend, current session read, and next direction", () => {
    expect(compassModelSchema.parse(compass)).toEqual(compass);
  });

  it("rejects generated Compass sentences longer than 180 characters", () => {
    expect(() =>
      compassModelSchema.parse({ ...compass, overall_trend: "x".repeat(181) }),
    ).toThrow();
  });

  it("keeps legacy stored coaching readable without generated Compass fields", () => {
    const result = coachingResponseSchema.safeParse({
      focus_area: FOCUS_AREAS[0],
      state_id: "hypoadduction",
      drill_id: "staccato_onsets",
      top_issue: "Land closer to the note",
      why: "The onset began below the target.",
      drill: "Repeat the landing.",
      encouragement: "The held vowel stayed clear.",
      calibrating: false,
      resolved: {
        state_id: "hypoadduction",
        state_name: "Breathy onset",
        remediation_family: "closure",
        audible_correction: null,
        drill: {
          id: "staccato_onsets",
          name: "Staccato onsets",
          instructions: "Send each onset to the wall.",
          duration_s: 30,
        },
        cues: ["Send each onset to the wall."],
        caution: null,
        used_fallback: false,
      },
    });

    expect(result.success).toBe(true);
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
