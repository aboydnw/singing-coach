import type { PracticeMessageRow } from "@/lib/practice";
import {
  coachingResponseSchema,
  exerciseSpecSchema,
  type LearningContract,
} from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";
import { parseStoredJson } from "@/lib/storedJson";

export type WorkspaceSummary = {
  encouragement?: string;
  focus: string;
};

const FALLBACK_FOCUS = "Listen for one clear, comfortable change.";

export function practiceWorkspaceSummary(
  attempt: SessionRow | null,
  contract: LearningContract | null,
): WorkspaceSummary {
  const coaching = attempt
    ? parseStoredJson(attempt.coaching_json, coachingResponseSchema)
    : null;
  const encouragement = conciseText(coaching?.encouragement || contract?.strength || "");
  const focus = conciseText(
    contract?.tryCue || coaching?.top_issue || contract?.focus || FALLBACK_FOCUS,
  );
  return {
    encouragement: encouragement || undefined,
    focus: focus || FALLBACK_FOCUS,
  };
}

export function workspaceAttempt(
  attempts: SessionRow[],
  requestedId: string | null,
): SessionRow | null {
  if (requestedId) {
    const requested = attempts.find((attempt) => attempt.id === requestedId);
    if (requested) return requested;
  }
  return attemptsNewestFirst(attempts)[0] ?? null;
}

export function retryProposalForAttempt(attempt: SessionRow) {
  return {
    spec: parseStoredJson(attempt.exercise_spec_json, exerciseSpecSchema),
    reason: "Keep the last attempt in mind and try the same exercise once more.",
    parentAttemptId: attempt.id,
    retry: true,
  };
}

export function attemptsNewestFirst(attempts: SessionRow[]): SessionRow[] {
  return attempts.toSorted((left, right) => {
    const leftSequence = left.sequence_number ?? 0;
    const rightSequence = right.sequence_number ?? 0;
    return (
      rightSequence - leftSequence ||
      right.ts.localeCompare(left.ts) ||
      right.id.localeCompare(left.id)
    );
  });
}

export function messagesForAttempt(
  messages: PracticeMessageRow[],
  attemptId: string,
): PracticeMessageRow[] {
  return messages.filter((message) => message.attempt_id === attemptId);
}

export function generalPracticeMessages(
  messages: PracticeMessageRow[],
): PracticeMessageRow[] {
  return messages.filter((message) => message.attempt_id === null);
}

function conciseText(value: string): string {
  const clean = value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean;
  if (sentence.length <= 160) return sentence;
  const clipped = sentence.slice(0, 159);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 100 ? boundary : 159).trimEnd()}…`;
}
