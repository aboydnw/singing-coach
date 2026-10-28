import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AttemptHistoryTable } from "@/components/AttemptHistoryTable";
import { system } from "@/lib/theme";
import type { SessionRow } from "@/lib/sessions";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const attempt: SessionRow = {
  id: "attempt-1",
  ts: "2026-10-28T17:49:44.000Z",
  exercise_type: "sustained",
  exercise_spec_json: JSON.stringify({ display_name: "Silent Night" }),
  measurements_json: "{}",
  coaching_md: "",
  coaching_json: JSON.stringify({
    top_issue: "Your notes are landing hundreds of cents away from the target.",
  }),
  audio_key: "attempt.wav",
  contour_json: null,
  practice_session_id: null,
  sequence_number: 1,
  parent_attempt_id: null,
  attempt_kind: "initial",
};

describe("AttemptHistoryTable", () => {
  it("offers progressive disclosure for long coaching on narrow screens", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(AttemptHistoryTable, {
          attempts: [attempt],
          playingId: null,
          onPlay: () => undefined,
        }),
      ),
    );

    expect(markup).toContain("Your notes are landing hundreds of cents away");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("More");
    expect(markup).toContain("Silent Night");
  });
});
