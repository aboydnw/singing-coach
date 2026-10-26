import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AttemptSummaryCard } from "@/components/practice/AttemptSummaryCard";
import { BackToPracticeControls } from "@/components/practice/BackToPracticeControls";
import { PracticeActionWorkspace } from "@/components/practice/PracticeActionWorkspace";
import { system } from "@/lib/theme";
import type { SessionRow } from "@/lib/sessions";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function render(element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, { value: system }, element),
  );
}

const attempt: SessionRow = {
  id: "attempt-1",
  ts: "2026-10-26T10:00:00.000Z",
  exercise_type: "scale",
  exercise_spec_json: JSON.stringify({
    type: "scale",
    target_notes_midi: [60, 62, 64],
    duration_per_note_s: 0.5,
    vowel: "ah",
    display_name: "Five-note scale",
  }),
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

describe("PracticeActionWorkspace", () => {
  it("puts concise coaching before controls and keeps exit actions together", () => {
    const html = render(
      React.createElement(
        PracticeActionWorkspace,
        {
          summary: {
            encouragement: "Your onset stayed clear.",
            focus: "Aim at the far wall.",
          },
          exerciseName: "Five-note scale",
          onDifferent: () => undefined,
          onEnd: () => undefined,
          actionsDisabled: false,
        },
        React.createElement("div", null, "Reference and recording controls"),
      ),
    );
    expect(html.indexOf("How it is going")).toBeLessThan(html.indexOf("Focus on this"));
    expect(html.indexOf("Focus on this")).toBeLessThan(
      html.indexOf("Reference and recording controls"),
    );
    expect(html).toContain('id="practice-controls"');
    expect(html).toContain("Different exercise");
    expect(html).toContain("End practice");
  });
});

describe("AttemptSummaryCard", () => {
  it("links a compact attempt summary to its detail route", () => {
    const html = render(
      React.createElement(AttemptSummaryCard, {
        practiceId: "practice-1",
        attempt,
        fallbackIndex: 0,
      }),
    );
    expect(html).toContain("/practice/practice-1/attempt/attempt-1");
    expect(html).toContain("Five-note scale");
    expect(html).toContain("Review attempt");
    expect(html).not.toContain("View full analysis");
  });
});

describe("BackToPracticeControls", () => {
  it("names and targets the action workspace", () => {
    const html = render(React.createElement(BackToPracticeControls, { visible: true }));
    expect(html).toContain("Back to practice controls");
    expect(html).toContain('href="#practice-controls"');
  });
});
