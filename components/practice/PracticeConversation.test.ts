import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PracticeMessage } from "@/components/practice/PracticeConversation";
import type { PracticeMessageRow } from "@/lib/practice";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function message(role: PracticeMessageRow["role"], text: string): PracticeMessageRow {
  return {
    id: `${role}-message`,
    practice_session_id: "practice-1",
    attempt_id: "attempt-1",
    role,
    content_json: { text },
    context_anchor_json: null,
    client_request_id: `${role}-request`,
    parent_message_id: null,
    created_at: "2026-09-18T00:00:00.000Z",
  };
}

function renderMessage(value: PracticeMessageRow) {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(PracticeMessage, { message: value }),
    ),
  );
}

describe("practice conversation formatting", () => {
  it("renders coach Markdown as semantic rich text", () => {
    const markup = renderMessage(
      message(
        "assistant",
        "**How it should feel**\n\n- Steady breath\n- Relaxed chest\n\n> Keep the sound bright.",
      ),
    );

    expect(markup).toContain("<strong>How it should feel</strong>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("<li>Steady breath</li>");
    expect(markup).toContain("<blockquote>");
  });

  it("keeps singer-authored Markdown-looking text literal", () => {
    const markup = renderMessage(message("user", "I literally typed **this**"));

    expect(markup).toContain("I literally typed **this**");
    expect(markup).not.toContain("<strong>this</strong>");
  });
});
