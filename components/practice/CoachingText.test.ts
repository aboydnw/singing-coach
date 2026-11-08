import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { CoachingText } from "./CoachingText";
import { CoachSnapshot } from "./CoachSnapshot";
import { AttemptResult } from "./AttemptResult";
import { system } from "@/lib/theme";
import { coachingAttempt, coachingPractice } from "./coachingReadingFixtures";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function render(child: React.ReactNode) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, { value: system, children: child }),
  );
}

describe("scannable coaching", () => {
  it("keeps short guidance visible without a redundant disclosure", () => {
    const html = render(
      React.createElement(CoachingText, {
        text: "Aim for a **clear landing**.",
        label: "focus",
      }),
    );
    expect(html).toContain("<strong>clear landing</strong>");
    expect(html).not.toContain("<details");
  });
  it("preserves every word of long guidance in keyboard-native disclosure", () => {
    const text =
      "Start with a clear note.\n\n" +
      "Keep the sound easy and listen to each landing. ".repeat(8) +
      "\n\n- First cue\n- Last cue";
    const html = render(
      React.createElement(CoachingText, { text, label: "focus", inverse: true }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
    expect(html).toContain("Read full focus");
    expect(html).toContain("<li>Last cue</li>");
    expect(html).toContain("Hide full focus");
    expect(html).not.toContain("<details open");
  });
  it("does not execute HTML or load model-authored images", () => {
    const html = render(
      React.createElement(CoachingText, {
        text: "<script>alert(1)</script>\n\n![example](https://example.com/track.png)",
        label: "focus",
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });
  it("puts a next cue before strength and keeps the complete focus accessible", () => {
    const html = render(React.createElement(CoachSnapshot, { latest: coachingPractice }));
    expect(html.indexOf("Try next")).toBeLessThan(html.indexOf(">Strength<"));
    expect(html).toContain("Read full focus");
    expect(html).toContain("<strong>What to listen for</strong>");
    expect(html).toContain('href="/progress"');
  });
  it("keeps the snapshot caution visible outside all disclosures", () => {
    const html = render(React.createElement(CoachSnapshot, { latest: coachingPractice }));
    const visible = html.replace(/<details\b[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Keep in mind");
    expect(visible).toContain("Do not push for volume.");
    expect(visible.indexOf("Do not push for volume.")).toBeLessThan(
      visible.indexOf(">Strength<"),
    );
  });
  it("never truncates or collapses a long caution, even without a next cue", () => {
    const avoid =
      "Keep it **comfortable**. " +
      "Do not push for volume. ".repeat(12) +
      "Stop if you feel strain.";
    const latest = {
      ...coachingPractice,
      learning_contract_json: {
        ...coachingPractice.learning_contract_json!,
        tryCue: "",
        avoid,
      },
    };
    const html = render(React.createElement(CoachSnapshot, { latest }));
    const visible = html.replace(/<details\b[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("<strong>comfortable</strong>");
    expect(visible).toContain("Stop if you feel strain.");
    expect(visible.match(/Do not push for volume\./g)).toHaveLength(12);
    expect(visible).not.toContain("Try next");
  });
  it("omits the caution section when the contract has no caution", () => {
    const latest = {
      ...coachingPractice,
      learning_contract_json: {
        ...coachingPractice.learning_contract_json!,
        avoid: null,
      },
    };
    expect(render(React.createElement(CoachSnapshot, { latest }))).not.toContain(
      "Keep in mind",
    );
  });
  it("separates observation, next cue, explanation and strength on attempt detail", () => {
    const html = render(
      React.createElement(AttemptResult, {
        attempt: coachingAttempt,
        parent: null,
        fallbackIndex: 1,
        expanded: false,
        onToggle: () => {},
        onAsk: () => {},
      }),
    );
    for (const label of [
      "One thing to notice",
      "Try next",
      "Why this matters",
      "Strength",
      "Read full observation",
      "Keep in mind",
      "View full analysis",
    ])
      expect(html).toContain(label);
    expect(html).toContain("<strong>below the target</strong>");
    expect(html).not.toContain("**below the target**");
  });
});
