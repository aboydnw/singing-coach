import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CalibrationFeedback,
  CalibrationPitchStatus,
  type CalibrationNotice,
} from "@/components/calibration/CalibrationFeedback";
import { AppNotice } from "@/components/ui/AppNotice";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function render(element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, { value: system, children: element }),
  );
}

function feedback(notice: CalibrationNotice | null) {
  return render(React.createElement(CalibrationFeedback, { notice }));
}

describe("CalibrationFeedback", () => {
  it("mounts empty alert and polite status regions before results arrive", () => {
    const html = feedback(null);
    expect(html).toContain('role="alert" aria-atomic="true"');
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(html.match(/role="(?:alert|status)"/g)).toHaveLength(2);
    expect(html).not.toContain("Saved.");
  });

  it.each([
    "Still need a clear recording for: Lowest comfortable note.",
    "Expected: low edge ≤ low comfortable ≤ high comfortable ≤ high edge.",
    'No clear pitch detected for "Lowest comfortable note" — try again.',
    "analysis failed",
    "save failed",
  ])("announces %s as an alert without a nested live region", (message) => {
    const html = feedback({ tone: "danger", message });
    const alert = html.indexOf('role="alert"');
    const status = html.indexOf('role="status"');
    expect(html.slice(alert, status)).toContain(message.replaceAll('"', "&quot;"));
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("puts the saved confirmation in the polite region, not the alert", () => {
    const message = "Saved. Range: C3–C5; tessitura: G3–E4.";
    const html = feedback({ tone: "success", message });
    const status = html.indexOf('role="status"');
    expect(html.slice(0, status)).not.toContain(message);
    expect(html.slice(status)).toContain(message);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("preserves the shared notice's default announcement behavior", () => {
    for (const tone of ["danger", "success"] as const) {
      const html = render(React.createElement(AppNotice, { tone, title: "Result" }));
      expect(html).toContain(`role="${tone === "danger" ? "alert" : "status"}"`);
    }
  });
});

describe("CalibrationPitchStatus", () => {
  it.each([
    { detecting: false, midi: null, text: "Not recorded yet" },
    { detecting: true, midi: null, text: "Detecting…" },
    { detecting: true, midi: 60, text: "Detecting…" },
    { detecting: false, midi: 60, text: "C4  (MIDI 60)" },
    { detecting: false, midi: 0, text: "C-1  (MIDI 0)" },
  ])("keeps $text in one slot-labeled polite region", ({ detecting, midi, text }) => {
    const html = render(
      React.createElement(CalibrationPitchStatus, {
        label: "Lowest comfortable note",
        detecting,
        midi,
      }),
    );
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(html).toContain("Lowest comfortable note: ");
    expect(html).toContain(text);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
    if (detecting) expect(html).not.toContain("(MIDI");
  });
});
