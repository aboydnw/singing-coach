import { describe, expect, it } from "vitest";
import { contractFromAttempt, initialContract } from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

function attempt(coaching: Record<string, unknown> | null): SessionRow {
  return {
    id: "attempt-1",
    ts: "2026-08-06T10:00:00.000Z",
    exercise_type: "scale",
    exercise_spec_json: null,
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: coaching ? JSON.stringify(coaching) : null,
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: 1,
    parent_attempt_id: null,
    attempt_kind: "initial",
  };
}

describe("initialContract", () => {
  it("turns a pitch start into an audible target rather than a score", () => {
    const contract = initialContract("pitch");
    expect(contract.focusArea).toBe("pitch_accuracy");
    expect(contract.listenFor).toContain("begins at its destination");
    expect(contract.confidence).toBe("early");
  });

  it("keeps free singing observational", () => {
    const contract = initialContract("free_sing");
    expect(contract.focusArea).toBeNull();
    expect(contract.focus).toContain("naturally does");
  });
});

describe("contractFromAttempt", () => {
  it("derives the Compass from immutable coaching evidence", () => {
    const prior = initialContract("coach_pick");
    const next = contractFromAttempt(
      prior,
      attempt({
        focus_area: "pitch_accuracy",
        top_issue: "Land closer to the note",
        why: "The beginning started below the target.",
        drill: "Repeat the landing.",
        encouragement: "The held portion stayed centered.",
        compass: {
          overall_trend: "Pitch starts are becoming more consistent.",
          current_session: "Today's second landing moved closer to the target.",
          next_direction: "Carry the cleaner onset into the next exercise.",
        },
        resolved: { cues: ["Place the note on the far wall"], caution: null },
      }),
    );
    expect(next.focus).toBe("Land closer to the note");
    expect(next.tryCue).toBe("Place the note on the far wall");
    expect(next.strength).toBe("The held portion stayed centered.");
    expect(next.updatedAfterAttemptId).toBe("attempt-1");
    expect(next.compass).toEqual({
      overallTrend: "Pitch starts are becoming more consistent.",
      currentSession: "Today's second landing moved closer to the target.",
      nextDirection: "Carry the cleaner onset into the next exercise.",
    });
  });

  it("leaves the Compass untouched when coaching is absent", () => {
    const prior = initialContract("tone");
    expect(contractFromAttempt(prior, attempt(null))).toBe(prior);
  });

  it("rejects stored coaching with no recognized fields", () => {
    const prior = initialContract("tone");
    expect(contractFromAttempt(prior, attempt({ unrelated: true }))).toBe(prior);
  });
});
