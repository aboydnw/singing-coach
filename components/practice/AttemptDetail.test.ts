import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AttemptDetailView } from "@/components/practice/AttemptDetail";
import { system } from "@/lib/theme";
import type { PracticeMessageRow, PracticeSessionRow } from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const attempt: SessionRow = {
  id: "attempt-1",
  ts: "2026-10-26T10:00:00.000Z",
  exercise_type: "scale",
  exercise_spec_json: null,
  measurements_json: "{}",
  coaching_md: "",
  coaching_json: null,
  audio_key: null,
  contour_json: null,
  practice_session_id: "practice-1",
  sequence_number: 1,
  parent_attempt_id: null,
  attempt_kind: "initial",
};

const practice = {
  id: "practice-1",
  status: "in_progress",
} as PracticeSessionRow;

function message(id: string, attemptId: string): PracticeMessageRow {
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

function render(ended = false) {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(AttemptDetailView, {
        practice: { ...practice, status: ended ? "ended" : "in_progress" },
        attempt,
        parent: null,
        messages: [message("Owned question", "attempt-1")],
        expanded: false,
        chatOpen: true,
        question: "",
        anchor: null,
        streamingText: "",
        streaming: false,
        onToggleAnalysis: () => undefined,
        onOpenChat: () => undefined,
        onQuestionChange: () => undefined,
        onClearAnchor: () => undefined,
        onSend: () => undefined,
        onStop: () => undefined,
        onAsk: () => undefined,
      }),
    ),
  );
}

describe("AttemptDetailView", () => {
  it("provides attempt-scoped navigation and conversation", () => {
    const html = render();
    expect(html).toContain("/practice/practice-1");
    expect(html).toContain("/practice/practice-1?retry=attempt-1#practice-controls");
    expect(html).toContain("Ask about this attempt");
    expect(html).toContain("Owned question");
  });

  it("keeps ended practices review only", () => {
    const html = render(true);
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("Ask about this attempt");
  });
});
