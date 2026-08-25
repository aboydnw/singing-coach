import type { SessionRow } from "@/lib/sessions";
import {
  attemptExerciseName,
  attemptOutcome,
  type PracticeMessageRow,
} from "@/lib/practice";

export type ExerciseThread = {
  id: string;
  attempts: SessionRow[];
  attemptIds: string[];
};

export type ExerciseTimelineItem =
  | { type: "attempt"; at: string; attempt: SessionRow }
  | { type: "message"; at: string; message: PracticeMessageRow };

export type ExerciseDraftState = {
  draftId: string | null;
  selectedExerciseId: string | null;
  previousRecordedExerciseId: string | null;
};

export type OpenExerciseDraftResult = ExerciseDraftState & { created: boolean };

function compareAttempts(left: SessionRow, right: SessionRow): number {
  const leftSequence = left.sequence_number ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence_number ?? Number.MAX_SAFE_INTEGER;
  return (
    leftSequence - rightSequence ||
    left.ts.localeCompare(right.ts) ||
    left.id.localeCompare(right.id)
  );
}

export function groupExerciseThreads(attempts: SessionRow[]): ExerciseThread[] {
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));

  function rootIdFor(attempt: SessionRow): string {
    const visited = new Set<string>();
    let current = attempt;

    while (current.parent_attempt_id) {
      if (visited.has(current.id)) return attempt.id;
      visited.add(current.id);
      const parent = attemptById.get(current.parent_attempt_id);
      if (!parent) return attempt.id;
      current = parent;
    }

    return current.id;
  }

  const attemptsByRoot = new Map<string, SessionRow[]>();
  for (const attempt of attempts) {
    const rootId = rootIdFor(attempt);
    const threadAttempts = attemptsByRoot.get(rootId) ?? [];
    threadAttempts.push(attempt);
    attemptsByRoot.set(rootId, threadAttempts);
  }

  return Array.from(attemptsByRoot, ([id, threadAttempts]) => {
    const sortedAttempts = threadAttempts.toSorted(compareAttempts);
    return {
      id,
      attempts: sortedAttempts,
      attemptIds: sortedAttempts.map((attempt) => attempt.id),
    };
  }).sort((left, right) => compareAttempts(left.attempts[0], right.attempts[0]));
}

export function messagesForExercise(
  messages: PracticeMessageRow[],
  thread: ExerciseThread,
): PracticeMessageRow[] {
  const attemptIds = new Set(thread.attemptIds);
  return messages.filter(
    (message) => message.attempt_id !== null && attemptIds.has(message.attempt_id),
  );
}

export function exerciseTimeline(
  thread: ExerciseThread,
  messages: PracticeMessageRow[],
): ExerciseTimelineItem[] {
  const items: ExerciseTimelineItem[] = [
    ...thread.attempts.map((attempt): ExerciseTimelineItem => ({
      type: "attempt",
      at: attempt.ts,
      attempt,
    })),
    ...messagesForExercise(messages, thread).map((message): ExerciseTimelineItem => ({
      type: "message",
      at: message.created_at,
      message,
    })),
  ];

  return items.sort((left, right) => {
    const atComparison = left.at.localeCompare(right.at);
    if (atComparison !== 0) return atComparison;
    if (left.type !== right.type) return left.type === "attempt" ? -1 : 1;
    const leftId = left.type === "attempt" ? left.attempt.id : left.message.id;
    const rightId = right.type === "attempt" ? right.attempt.id : right.message.id;
    return leftId.localeCompare(rightId);
  });
}

export function latestAttempt(thread: ExerciseThread): SessionRow {
  return thread.attempts[thread.attempts.length - 1];
}

export function exerciseNavigationSummary(thread: ExerciseThread, index: number) {
  const attemptCount = thread.attempts.length;
  return {
    label: `Exercise ${index + 1}`,
    name: attemptExerciseName(thread.attempts[0]),
    attemptCount: `${attemptCount} ${attemptCount === 1 ? "attempt" : "attempts"}`,
    outcome: attemptOutcome(latestAttempt(thread)),
  };
}

export function selectedExerciseAfterRefresh(
  currentId: string | null,
  threads: ExerciseThread[],
  newlyCreatedAttemptId?: string | null,
): string | null {
  if (newlyCreatedAttemptId) {
    const newlyCreatedThread = threads.find((thread) =>
      thread.attemptIds.includes(newlyCreatedAttemptId),
    );
    if (newlyCreatedThread) return newlyCreatedThread.id;
  }
  if (currentId && threads.some((thread) => thread.id === currentId)) return currentId;
  return threads.at(-1)?.id ?? null;
}

export function openExerciseDraft(
  state: ExerciseDraftState,
  newDraftId: string,
): OpenExerciseDraftResult {
  if (state.draftId) {
    return {
      ...state,
      selectedExerciseId: state.draftId,
      previousRecordedExerciseId:
        state.selectedExerciseId && state.selectedExerciseId !== state.draftId
          ? state.selectedExerciseId
          : state.previousRecordedExerciseId,
      created: false,
    };
  }

  return {
    draftId: newDraftId,
    selectedExerciseId: newDraftId,
    previousRecordedExerciseId: state.selectedExerciseId,
    created: true,
  };
}

export function cancelExerciseDraft(
  previousRecordedExerciseId: string | null,
  threads: ExerciseThread[],
): string | null {
  if (
    previousRecordedExerciseId &&
    threads.some((thread) => thread.id === previousRecordedExerciseId)
  ) {
    return previousRecordedExerciseId;
  }
  return threads.at(-1)?.id ?? null;
}

export function selectedExerciseFromNavigator(
  state: ExerciseDraftState,
  exerciseId: string,
  threads: ExerciseThread[],
): ExerciseDraftState {
  if (state.draftId && exerciseId === state.draftId) {
    const next = openExerciseDraft(state, state.draftId);
    return {
      draftId: next.draftId,
      selectedExerciseId: next.selectedExerciseId,
      previousRecordedExerciseId: next.previousRecordedExerciseId,
    };
  }
  if (threads.some((thread) => thread.id === exerciseId)) {
    return { ...state, selectedExerciseId: exerciseId };
  }
  return state;
}

export function recordedExerciseIdForAttempt(
  threads: ExerciseThread[],
  attemptId: string,
): string | null {
  return threads.find((thread) => thread.attemptIds.includes(attemptId))?.id ?? null;
}

export function unsavedAttemptAfterDraftCancel(
  unsavedAttempt: SessionRow | null,
  threads: ExerciseThread[],
): SessionRow | null {
  if (!unsavedAttempt?.parent_attempt_id) return null;
  return recordedExerciseIdForAttempt(threads, unsavedAttempt.parent_attempt_id)
    ? unsavedAttempt
    : null;
}
