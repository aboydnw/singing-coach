import { describe, expect, it } from "vitest";
import {
  activePracticeThread,
  contractFromAttempt,
  initialContract,
  messagesForAttempt,
  selectedAttemptAfterRefresh,
  type PracticeMessageRow,
} from "@/lib/practice";
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

function message(id: string, attemptId: string | null): PracticeMessageRow {
  return {
    id,
    practice_session_id: "practice-1",
    attempt_id: attemptId,
    user_id: "user-1",
    role: "user",
    content_json: { text: id },
    context_anchor_json: null,
    status: "complete",
    client_request_id: null,
    created_at: "2026-08-06T10:00:00.000Z",
    completed_at: "2026-08-06T10:00:01.000Z",
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

describe("messagesForAttempt", () => {
  it("keeps each conversation inside its owning attempt", () => {
    const messages = [
      message("first-question", "attempt-1"),
      message("second-question", "attempt-2"),
      message("legacy-session-message", null),
    ];

    expect(messagesForAttempt(messages, "attempt-2").map((row) => row.id)).toEqual([
      "second-question",
    ]);
  });
});

describe("selectedAttemptAfterRefresh", () => {
  const attempts = [attempt(null), { ...attempt(null), id: "attempt-2" }];

  it("selects the latest attempt on first load", () => {
    expect(selectedAttemptAfterRefresh(null, attempts)).toBe("attempt-2");
  });

  it("preserves a selected attempt that still exists", () => {
    expect(selectedAttemptAfterRefresh("attempt-1", attempts)).toBe("attempt-1");
  });

  it("falls back to the latest attempt when selection is stale", () => {
    expect(selectedAttemptAfterRefresh("missing", attempts)).toBe("attempt-2");
  });

  it("prefers a newly created attempt", () => {
    expect(selectedAttemptAfterRefresh("attempt-1", attempts, "attempt-2")).toBe(
      "attempt-2",
    );
  });

  it("returns no selection before the first recording", () => {
    expect(selectedAttemptAfterRefresh(null, [])).toBeNull();
  });
});

describe("activePracticeThread", () => {
  it("returns one selected attempt with only its conversation", () => {
    const first = attempt(null);
    const second = { ...attempt(null), id: "attempt-2" };
    const firstQuestion = message("first-question", first.id);
    const secondQuestion = message("second-question", second.id);

    expect(
      activePracticeThread(
        [first, second],
        [firstQuestion, secondQuestion, message("legacy", null)],
        second.id,
      ),
    ).toEqual({ attempt: second, messages: [secondQuestion] });
  });

  it("returns an empty thread before the first recording", () => {
    expect(activePracticeThread([], [message("legacy", null)], null)).toEqual({
      attempt: null,
      messages: [],
    });
  });
});
