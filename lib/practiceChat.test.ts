import { describe, expect, it } from "vitest";
import { buildExerciseChatHistory, practiceChatRequestSchema } from "@/lib/practiceChat";
import type { PracticeMessageRow } from "@/lib/practice";

function message(args: {
  id: string;
  attemptId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  status?: PracticeMessageRow["status"];
}): PracticeMessageRow {
  return {
    id: args.id,
    practice_session_id: "11111111-1111-4111-8111-111111111111",
    attempt_id: args.attemptId,
    user_id: "user-1",
    role: args.role,
    content_json: { text: args.text },
    context_anchor_json: null,
    status: args.status ?? "complete",
    client_request_id: null,
    created_at: args.createdAt,
    completed_at: args.createdAt,
  };
}

describe("practiceChatRequestSchema", () => {
  it("requires a valid attempt id for every chat request", () => {
    const result = practiceChatRequestSchema.safeParse({
      practice_session_id: "11111111-1111-4111-8111-111111111111",
      message: "What should I listen for?",
      context_anchor: null,
      client_request_id: "22222222-2222-4222-8222-222222222222",
      user_message_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.success).toBe(false);
  });
});

describe("buildExerciseChatHistory", () => {
  it("keeps complete history across retries in the selected exercise", () => {
    const rootId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const retryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const messages = [
      message({
        id: "retry-question",
        attemptId: retryId,
        role: "user",
        text: "Question after the retry",
        createdAt: "2026-08-24T10:00:03.000Z",
      }),
      message({
        id: "root-answer",
        attemptId: rootId,
        role: "assistant",
        text: "Answer on the first take",
        createdAt: "2026-08-24T10:00:02.000Z",
      }),
      message({
        id: "other-exercise",
        attemptId: otherId,
        role: "assistant",
        text: "Do not include me",
        createdAt: "2026-08-24T10:00:01.500Z",
      }),
      message({
        id: "root-question",
        attemptId: rootId,
        role: "user",
        text: "Question on the first take",
        createdAt: "2026-08-24T10:00:01.000Z",
      }),
      message({
        id: "current-user",
        attemptId: retryId,
        role: "user",
        text: "Current question",
        createdAt: "2026-08-24T10:00:04.000Z",
      }),
      message({
        id: "empty-answer",
        attemptId: rootId,
        role: "assistant",
        text: "",
        createdAt: "2026-08-24T10:00:05.000Z",
      }),
      message({
        id: "failed-answer",
        attemptId: retryId,
        role: "assistant",
        text: "Incomplete",
        createdAt: "2026-08-24T10:00:06.000Z",
        status: "failed",
      }),
    ];

    expect(
      buildExerciseChatHistory(messages, new Set([rootId, retryId]), "current-user"),
    ).toEqual([
      { role: "user", content: "Question on the first take" },
      { role: "assistant", content: "Answer on the first take" },
      { role: "user", content: "Question after the retry" },
    ]);
  });
});
