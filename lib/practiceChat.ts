import { z } from "zod";
import type { PracticeMessageRow } from "@/lib/practice";
import { contextAnchorSchema } from "@/lib/schema";

export const practiceChatRequestSchema = z.object({
  practice_session_id: z.string().uuid(),
  attempt_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  context_anchor: contextAnchorSchema.nullable().default(null),
  client_request_id: z.string().uuid(),
  user_message_id: z.string().uuid(),
});

type AttemptChatMessage = Pick<
  PracticeMessageRow,
  "id" | "attempt_id" | "role" | "content_json" | "status" | "created_at"
>;

export const EXERCISE_CHAT_HISTORY_CANDIDATE_LIMIT = 48;

export function exerciseChatHistoryQueryContract(userMessageId: string) {
  // Complete rows are filtered in SQL. Four times the 12-message prompt window
  // leaves room for legacy complete rows whose text is empty without unbounded reads.
  return {
    excludedMessageId: userMessageId,
    order: [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ] as const,
    limit: EXERCISE_CHAT_HISTORY_CANDIDATE_LIMIT,
  };
}

export function buildExerciseChatHistory(
  messages: AttemptChatMessage[],
  attemptIds: ReadonlySet<string>,
  userMessageId: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(
      (message) =>
        message.attempt_id !== null &&
        attemptIds.has(message.attempt_id) &&
        message.status === "complete" &&
        message.id !== userMessageId &&
        Boolean(message.content_json.text),
    )
    .toSorted(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content_json.text,
    }));
}
