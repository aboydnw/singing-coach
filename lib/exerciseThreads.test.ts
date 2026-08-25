import { describe, expect, it } from "vitest";
import {
  attemptIdForExerciseMessage,
  cancelExerciseDraft,
  exerciseNavigationSummary,
  exerciseTimeline,
  groupExerciseThreads,
  latestAttempt,
  messagesForExercise,
  openExerciseDraft,
  recordedExerciseIdForAttempt,
  selectedExerciseFromNavigator,
  selectedExerciseAfterRefresh,
  unsavedAttemptAfterDraftCancel,
  type ExerciseTimelineItem,
} from "@/lib/exerciseThreads";
import type { PracticeMessageRow } from "@/lib/practice";
import type { ContextAnchor } from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";

function attempt({
  id,
  parentId,
  kind,
  sequence,
}: {
  id: string;
  parentId: string | null;
  kind: "initial" | "retry";
  sequence: number;
}): SessionRow {
  return {
    id,
    ts: `2026-08-25T10:00:0${sequence}.000Z`,
    exercise_type: "scale",
    exercise_spec_json: '{"type":"scale","target_notes_midi":[60,62,64]}',
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: null,
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: sequence,
    parent_attempt_id: parentId,
    attempt_kind: kind,
  };
}

function message({
  id,
  attemptId,
  createdAt,
  role = "user",
}: {
  id: string;
  attemptId: string | null;
  createdAt: string;
  role?: "user" | "assistant";
}): PracticeMessageRow {
  return {
    id,
    practice_session_id: "practice-1",
    attempt_id: attemptId,
    user_id: "user-1",
    role,
    content_json: { text: id },
    context_anchor_json: null,
    status: "complete",
    client_request_id: null,
    created_at: createdAt,
    completed_at: createdAt,
  };
}

function itemKey(item: ExerciseTimelineItem): string {
  return item.type === "attempt"
    ? `attempt:${item.attempt.id}`
    : `message:${item.message.id}`;
}

describe("groupExerciseThreads", () => {
  it("groups direct and transitive retries without merging identical initial exercises", () => {
    const threads = groupExerciseThreads([
      attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
      attempt({ id: "retry-a1", parentId: "root-a", kind: "retry", sequence: 2 }),
      attempt({ id: "retry-a2", parentId: "retry-a1", kind: "retry", sequence: 3 }),
      attempt({ id: "root-b", parentId: null, kind: "initial", sequence: 4 }),
    ]);

    expect(threads.map((thread) => [thread.id, thread.attemptIds])).toEqual([
      ["root-a", ["root-a", "retry-a1", "retry-a2"]],
      ["root-b", ["root-b"]],
    ]);
  });

  it("keeps an attempt with a missing parent as its own thread", () => {
    const threads = groupExerciseThreads([
      attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
      attempt({ id: "orphan", parentId: "missing", kind: "retry", sequence: 2 }),
    ]);

    expect(threads.map((thread) => [thread.id, thread.attemptIds])).toEqual([
      ["root-a", ["root-a"]],
      ["orphan", ["orphan"]],
    ]);
  });

  it("keeps both attempts in a parent cycle as separate threads", () => {
    const threads = groupExerciseThreads([
      attempt({ id: "cycle-a", parentId: "cycle-b", kind: "retry", sequence: 1 }),
      attempt({ id: "cycle-b", parentId: "cycle-a", kind: "retry", sequence: 2 }),
    ]);

    expect(threads.map((thread) => [thread.id, thread.attemptIds])).toEqual([
      ["cycle-a", ["cycle-a"]],
      ["cycle-b", ["cycle-b"]],
    ]);
  });
});

describe("exercise thread helpers", () => {
  const attempts = [
    attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
    attempt({ id: "retry-a1", parentId: "root-a", kind: "retry", sequence: 4 }),
    attempt({ id: "retry-a2", parentId: "retry-a1", kind: "retry", sequence: 5 }),
    attempt({ id: "root-b", parentId: null, kind: "initial", sequence: 6 }),
  ];
  const threads = groupExerciseThreads(attempts);
  const threadA = threads[0];
  const timelineThread = groupExerciseThreads(attempts.slice(0, 2))[0];

  it("includes messages from every attempt in an exercise and excludes other exercises", () => {
    const messages = [
      message({
        id: "question-a",
        attemptId: "root-a",
        createdAt: "2026-08-25T10:00:02.000Z",
      }),
      message({
        id: "answer-a",
        attemptId: "retry-a1",
        createdAt: "2026-08-25T10:00:03.000Z",
        role: "assistant",
      }),
      message({
        id: "question-a2",
        attemptId: "retry-a2",
        createdAt: "2026-08-25T10:00:05.500Z",
      }),
      message({
        id: "question-b",
        attemptId: "root-b",
        createdAt: "2026-08-25T10:00:07.000Z",
      }),
      message({
        id: "legacy",
        attemptId: null,
        createdAt: "2026-08-25T10:00:08.000Z",
      }),
    ];

    expect(messagesForExercise(messages, threadA).map((row) => row.id)).toEqual([
      "question-a",
      "answer-a",
      "question-a2",
    ]);
  });

  it("orders attempts and messages into one deterministic exercise timeline", () => {
    const messages = [
      message({
        id: "answer-a",
        attemptId: "retry-a1",
        createdAt: "2026-08-25T10:00:03.000Z",
        role: "assistant",
      }),
      message({
        id: "question-a",
        attemptId: "root-a",
        createdAt: "2026-08-25T10:00:02.000Z",
      }),
    ];

    expect(exerciseTimeline(timelineThread, messages).map(itemKey)).toEqual([
      "attempt:root-a",
      "message:question-a",
      "message:answer-a",
      "attempt:retry-a1",
    ]);
  });

  it("renders attempts before messages at the same time and then compares IDs", () => {
    const rootTime = attempts[0].ts;
    const messages = [
      message({ id: "message-b", attemptId: "root-a", createdAt: rootTime }),
      message({ id: "message-a", attemptId: "root-a", createdAt: rootTime }),
    ];

    expect(exerciseTimeline(timelineThread, messages).map(itemKey).slice(0, 3)).toEqual([
      "attempt:root-a",
      "message:message-a",
      "message:message-b",
    ]);
  });

  it("returns the chronologically latest attempt in a thread", () => {
    expect(latestAttempt(threadA).id).toBe("retry-a2");
  });

  it("uses only persisted anchors in the selected exercise and defaults unanchored chat to latest", () => {
    const persistedAnchor: ContextAnchor = {
      kind: "coaching_text",
      sourceId: "retry-a1",
      label: "Coach’s correction",
      value: "Keep the landing easy.",
    };
    const ephemeralAnchor: ContextAnchor = {
      ...persistedAnchor,
      sourceId: "practice-1",
    };

    expect(attemptIdForExerciseMessage(threadA, persistedAnchor)).toBe("retry-a1");
    expect(attemptIdForExerciseMessage(threadA, ephemeralAnchor)).toBeNull();
    expect(attemptIdForExerciseMessage(threadA, null)).toBe("retry-a2");
  });

  it("summarizes a multi-attempt exercise from its root and latest attempt", () => {
    const thread = groupExerciseThreads([
      {
        ...attempt({ id: "root-summary", parentId: null, kind: "initial", sequence: 1 }),
        exercise_spec_json:
          '{"type":"sustained","target_notes_midi":[53],"duration_per_note_s":3,"vowel":"ah","display_name":"Sustain ‘ah’ on F3"}',
        coaching_json: '{"top_issue":"Keep the pitch centered."}',
      },
      {
        ...attempt({
          id: "retry-summary",
          parentId: "root-summary",
          kind: "retry",
          sequence: 2,
        }),
        exercise_spec_json:
          '{"type":"sustained","target_notes_midi":[53],"duration_per_note_s":3,"vowel":"ah","display_name":"A renamed retry"}',
        coaching_json: '{"top_issue":"Keep the release easy."}',
      },
    ])[0];

    expect(exerciseNavigationSummary(thread, 0)).toEqual({
      label: "Exercise 1",
      name: "Sustain ‘ah’ on F3",
      attemptCount: "2 attempts",
      outcome: "Keep the release easy.",
    });
  });

  it("summarizes a one-attempt free sing exercise", () => {
    const thread = groupExerciseThreads([
      {
        ...attempt({ id: "free-sing", parentId: null, kind: "initial", sequence: 1 }),
        exercise_type: "free_sing",
        exercise_spec_json: null,
      },
    ])[0];

    expect(exerciseNavigationSummary(thread, 1)).toEqual({
      label: "Exercise 2",
      name: "Free sing",
      attemptCount: "1 attempt",
      outcome: "Analysis saved",
    });
  });
});

describe("selectedExerciseAfterRefresh", () => {
  const threads = groupExerciseThreads([
    attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
    attempt({ id: "retry-a1", parentId: "root-a", kind: "retry", sequence: 2 }),
    attempt({ id: "root-b", parentId: null, kind: "initial", sequence: 3 }),
  ]);

  it("selects the last exercise on first load", () => {
    expect(selectedExerciseAfterRefresh(null, threads)).toBe("root-b");
  });

  it("preserves a valid exercise selection", () => {
    expect(selectedExerciseAfterRefresh("root-a", threads)).toBe("root-a");
  });

  it("selects a newly created root exercise", () => {
    expect(selectedExerciseAfterRefresh("draft", threads, "root-b")).toBe("root-b");
  });

  it("preserves the root exercise when its newly created attempt is a retry", () => {
    expect(selectedExerciseAfterRefresh("root-a", threads, "retry-a1")).toBe("root-a");
  });

  it("returns no selection when there are no exercises", () => {
    expect(selectedExerciseAfterRefresh(null, [])).toBeNull();
  });
});

describe("exercise draft transitions", () => {
  const threads = groupExerciseThreads([
    attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
    attempt({ id: "retry-a1", parentId: "root-a", kind: "retry", sequence: 2 }),
    attempt({ id: "root-b", parentId: null, kind: "initial", sequence: 3 }),
  ]);

  it("creates one draft and remembers the recorded exercise for cancel", () => {
    expect(
      openExerciseDraft(
        {
          draftId: null,
          selectedExerciseId: "root-a",
          previousRecordedExerciseId: null,
        },
        "draft",
      ),
    ).toEqual({
      draftId: "draft",
      selectedExerciseId: "draft",
      previousRecordedExerciseId: "root-a",
      created: true,
    });
  });

  it("reselects the existing draft without replacing it", () => {
    expect(
      openExerciseDraft(
        {
          draftId: "draft",
          selectedExerciseId: "root-a",
          previousRecordedExerciseId: "root-a",
        },
        "unused-new-id",
      ),
    ).toMatchObject({ selectedExerciseId: "draft", created: false });
  });

  it("returns an existing draft to the most recently selected recorded exercise", () => {
    expect(
      openExerciseDraft(
        {
          draftId: "draft",
          selectedExerciseId: "root-b",
          previousRecordedExerciseId: "root-a",
        },
        "unused-new-id",
      ),
    ).toMatchObject({
      selectedExerciseId: "draft",
      previousRecordedExerciseId: "root-b",
      created: false,
    });
  });

  it("cancels to B after selecting draft from A, then B, then the draft sidebar item", () => {
    const draftFromA = openExerciseDraft(
      {
        draftId: null,
        selectedExerciseId: "root-a",
        previousRecordedExerciseId: null,
      },
      "draft",
    );
    const selectedB = selectedExerciseFromNavigator(draftFromA, "root-b", threads);
    const returnedToDraft = selectedExerciseFromNavigator(selectedB, "draft", threads);

    expect(cancelExerciseDraft(returnedToDraft.previousRecordedExerciseId, threads)).toBe(
      "root-b",
    );
  });

  it("cancels to the prior recorded exercise when it still exists", () => {
    expect(cancelExerciseDraft("root-a", threads)).toBe("root-a");
  });

  it("falls back to the latest recorded exercise when the prior one is gone", () => {
    expect(cancelExerciseDraft("missing", threads)).toBe("root-b");
  });

  it("maps a saved retry to its current root and a new root to itself", () => {
    expect(recordedExerciseIdForAttempt(threads, "retry-a1")).toBe("root-a");
    expect(recordedExerciseIdForAttempt(threads, "root-b")).toBe("root-b");
    expect(recordedExerciseIdForAttempt(threads, "missing")).toBeNull();
  });

  it("preserves an unsaved retry when canceling a later exercise draft", () => {
    const unsavedRetry = attempt({
      id: "unsaved-retry",
      parentId: "retry-a1",
      kind: "retry",
      sequence: 4,
    });

    expect(unsavedAttemptAfterDraftCancel(unsavedRetry, threads)).toBe(unsavedRetry);
  });

  it("clears an unsaved first attempt owned by the canceled draft", () => {
    const unsavedFirstAttempt = attempt({
      id: "unsaved-first",
      parentId: null,
      kind: "initial",
      sequence: 4,
    });

    expect(unsavedAttemptAfterDraftCancel(unsavedFirstAttempt, threads)).toBeNull();
  });
});
