import type { AttemptJobRow } from "@/lib/attemptJobs";
import { describe, expect, it } from "vitest";
import {
  attemptsNewestFirst,
  completedWorkspaceAttempt,
  workspaceCompletionPending,
  generalPracticeMessages,
  messagesForAttempt,
  practiceWorkspaceSummary,
  retryProposalForAttempt,
  workspaceAttempt,
} from "@/lib/practiceWorkspace";
import { exerciseForDrill } from "@/lib/exercises";
import {
  contractFromAttempt,
  initialContract,
  type PracticeMessageRow,
} from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

function attempt(
  id: string,
  sequence: number,
  coaching: object | null = null,
): SessionRow {
  return {
    id,
    ts: `2026-10-26T10:00:0${sequence}.000Z`,
    exercise_type: "scale",
    exercise_spec_json: JSON.stringify({
      type: "scale",
      display_name: "Five-note scale",
      instructions: "Sing the pattern on ah.",
      target_notes_midi: [60, 62, 64, 65, 67],
      duration_per_note_s: 0.5,
      vowel: "ah",
    }),
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: coaching ? JSON.stringify(coaching) : null,
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: sequence,
    parent_attempt_id: sequence > 1 ? "attempt-1" : null,
    attempt_kind: sequence > 1 ? "retry" : "initial",
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
    created_at: "2026-10-26T10:00:00.000Z",
    completed_at: "2026-10-26T10:00:01.000Z",
  };
}

describe("practiceWorkspaceSummary", () => {
  it("uses the current safe fallback cue after persistence without rewriting legacy coaching or cautions", () => {
    const prior = attempt("attempt-1", 1, {
      drill: "Slide up an octave on ooh and back down.",
      resolved: { caution: "Stop if uncomfortable." },
    });
    const contract = contractFromAttempt(initialContract("coach_pick"), prior);
    const originalContract = JSON.stringify(contract);
    const originalCoaching = prior.coaching_json;
    const spec = exerciseForDrill(
      {
        range_low_midi: 57,
        range_high_midi: 60,
        tessitura_low_midi: null,
        tessitura_high_midi: null,
      },
      0,
      "siren",
      "Octave slide on 'ooh'",
    );
    const saved = {
      ...attempt("attempt-2", 2),
      exercise_spec_json: JSON.stringify(spec),
    };
    const retry = retryProposalForAttempt(saved);
    expect(retry.spec?.range_fallback).toBe(true);
    expect(retry.spec).toEqual(spec);
    expect(practiceWorkspaceSummary(prior, contract, retry.spec).focus).toBe(
      "Use a comfortable sustained note on 'ah' because the requested pattern does not fit your calibrated range.",
    );
    expect(practiceWorkspaceSummary(prior, contract).focus).toBe(
      "Slide up an octave on ooh and back down.",
    );
    expect(contract.avoid).toBe("Stop if uncomfortable.");
    expect(JSON.stringify(contract)).toBe(originalContract);
    expect(prior.coaching_json).toBe(originalCoaching);
  });

  it("uses concise structured coaching and strips formatting", () => {
    const contract = {
      ...initialContract("coach_pick"),
      strength: "**Your onset stayed clear.**",
      tryCue: "Aim_the_note at the far wall.",
    };
    const summary = practiceWorkspaceSummary(attempt("attempt-1", 1), contract);
    expect(summary.encouragement).toBe("Your onset stayed clear.");
    expect(summary.focus).toBe("Aim the note at the far wall.");
  });

  it("caps long guidance and provides a neutral fallback", () => {
    const contract = { ...initialContract("coach_pick"), tryCue: "word ".repeat(60) };
    expect(
      practiceWorkspaceSummary(attempt("attempt-1", 1), contract).focus.length,
    ).toBeLessThanOrEqual(160);
    expect(practiceWorkspaceSummary(attempt("attempt-1", 1), null).focus).toBe(
      "Listen for one clear, comfortable change.",
    );
  });
});

describe("workspace attempt selection", () => {
  const attempts = [attempt("attempt-1", 1), attempt("attempt-2", 2)];

  it("uses an owned requested attempt and otherwise the latest", () => {
    expect(workspaceAttempt(attempts, "attempt-1")?.id).toBe("attempt-1");
    expect(workspaceAttempt(attempts, "foreign")?.id).toBe("attempt-2");
    expect(workspaceAttempt(attempts, null)?.id).toBe("attempt-2");
  });

  it("creates a retry proposal from the selected attempt", () => {
    const proposal = retryProposalForAttempt(attempts[1]);
    expect(proposal.parentAttemptId).toBe("attempt-2");
    expect(proposal.retry).toBe(true);
    expect(proposal.spec?.display_name).toBe("Five-note scale");
  });

  it("orders history newest first without mutating input", () => {
    expect(attemptsNewestFirst(attempts).map((row) => row.id)).toEqual([
      "attempt-2",
      "attempt-1",
    ]);
    expect(attempts.map((row) => row.id)).toEqual(["attempt-1", "attempt-2"]);
  });
});

describe("workspace message ownership", () => {
  const messages = [
    message("one", "attempt-1"),
    message("two", "attempt-2"),
    message("general", null),
  ];

  it("keeps attempt conversations strictly scoped", () => {
    expect(messagesForAttempt(messages, "attempt-1").map((row) => row.id)).toEqual([
      "one",
    ]);
  });

  it("keeps only unanchored legacy messages as general questions", () => {
    expect(generalPracticeMessages(messages).map((row) => row.id)).toEqual(["general"]);
  });
});

describe("durable completion restores the next-attempt workspace", () => {
  const saved = attempt("attempt-2", 2);
  const completed = {
    id: "job-2",
    status: "completed",
    attempt_id: saved.id,
    created_at: "2026-11-07T12:00:00Z",
  } as AttemptJobRow;

  it("transitions from coaching with a saved session to retry-ready controls", () => {
    expect(
      completedWorkspaceAttempt([{ ...completed, status: "coaching" }], [saved]),
    ).toBeNull();
    const ready = completedWorkspaceAttempt([completed], [saved]);
    expect(ready).toBe(saved);
    const proposal = retryProposalForAttempt(ready!);
    expect(proposal.parentAttemptId).toBe(saved.id);
    expect(proposal.retry).toBe(true);
    expect(proposal.spec?.display_name).toBe("Five-note scale");
  });

  it("restores after reopening and repeated completion refreshes", () => {
    expect(completedWorkspaceAttempt([completed], [saved])).toBe(saved);
    expect(completedWorkspaceAttempt([completed], [saved])).toBe(saved);
  });

  it.each(["queued", "analyzing", "coaching", "failed", "abandoned"] as const)(
    "never replaces the newer %s job with an older completed attempt",
    (status) => {
      const newer = {
        ...completed,
        id: "job-3",
        status,
        created_at: "2026-11-07T12:05:00Z",
      };
      expect(completedWorkspaceAttempt([newer, completed], [saved])).toBeNull();
    },
  );

  it("waits for the completed job's exact saved attempt", () => {
    expect(completedWorkspaceAttempt([completed], [attempt("other", 1)])).toBeNull();
    expect(
      completedWorkspaceAttempt([{ ...completed, attempt_id: null }], [saved]),
    ).toBeNull();
    expect(completedWorkspaceAttempt([], [saved])).toBeNull();
  });

  it("keeps reconciliation polling through a completed job with a stale attempt snapshot", () => {
    expect(workspaceCompletionPending([{ ...completed, status: "coaching" }], [])).toBe(
      false,
    );
    expect(workspaceCompletionPending([completed], [])).toBe(true);
    expect(completedWorkspaceAttempt([completed], [])).toBeNull();
    expect(workspaceCompletionPending([completed], [saved])).toBe(false);
    expect(completedWorkspaceAttempt([completed], [saved])).toBe(saved);
    expect(workspaceCompletionPending([{ ...completed, status: "failed" }], [])).toBe(
      false,
    );
  });

  it("restores free singing without inventing a scored exercise", () => {
    const free = { ...saved, exercise_spec_json: null };
    expect(
      retryProposalForAttempt(completedWorkspaceAttempt([completed], [free])!).spec,
    ).toBeNull();
  });
});
