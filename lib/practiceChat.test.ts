import { describe, expect, it } from "vitest";
import { buildAttemptChatHistory, practiceChatRequestSchema } from "@/lib/practiceChat";
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

describe("buildAttemptChatHistory", () => {
  it("keeps history chronological and inside the selected attempt", () => {
    const attemptA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const attemptB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const messages = [
      message({
        id: "a-answer",
        attemptId: attemptA,
        role: "assistant",
        text: "Earlier answer",
        createdAt: "2026-08-24T10:00:02.000Z",
      }),
      message({
        id: "other-attempt",
        attemptId: attemptB,
        role: "assistant",
        text: "Do not include me",
        createdAt: "2026-08-24T10:00:01.500Z",
      }),
      message({
        id: "a-question",
        attemptId: attemptA,
        role: "user",
        text: "Earlier question",
        createdAt: "2026-08-24T10:00:01.000Z",
      }),
      message({
        id: "current-user",
        attemptId: attemptA,
        role: "user",
        text: "Current question",
        createdAt: "2026-08-24T10:00:03.000Z",
      }),
      message({
        id: "failed-answer",
        attemptId: attemptA,
        role: "assistant",
        text: "Incomplete",
        createdAt: "2026-08-24T10:00:04.000Z",
        status: "failed",
      }),
    ];

    expect(buildAttemptChatHistory(messages, attemptA, "current-user")).toEqual([
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ]);
  });
});
