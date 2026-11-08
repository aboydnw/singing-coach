import { describe, expect, it } from "vitest";
import { isRecorderBusy } from "@/components/Recorder";

describe("isRecorderBusy", () => {
  it("keeps navigation locked while a recording is being produced", () => {
    expect(isRecorderBusy({ phase: "requesting" })).toBe(true);
    expect(isRecorderBusy({ phase: "recording" })).toBe(true);
    expect(isRecorderBusy({ phase: "stopping" })).toBe(true);
    expect(isRecorderBusy({ phase: "review" })).toBe(true);
    expect(isRecorderBusy({ phase: "encoding" })).toBe(true);
    expect(isRecorderBusy({ phase: "uploading", fraction: 0.5 })).toBe(true);
  });

  it("releases navigation after idle, completion, or error", () => {
    expect(isRecorderBusy({ phase: "idle" })).toBe(false);
    expect(isRecorderBusy({ phase: "done", storageKey: "recording.wav" })).toBe(false);
    expect(isRecorderBusy({ phase: "error", message: "failed" })).toBe(false);
  });
});

import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, vi } from "vitest";
import { RecorderControls, type RecorderState } from "@/components/Recorder";
import { microphoneErrorMessage } from "@/lib/recorder";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderControl(state: RecorderState, disabled = false) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, {
      value: system,
      children: React.createElement(RecorderControls, {
        state,
        disabled,
        onStart: () => undefined,
        onStop: () => undefined,
        onCancelRequest: () => undefined,
        onDiscard: () => undefined,
        onSubmit: () => undefined,
      }),
    }),
  );
}

describe("RecorderControls", () => {
  it.each(["recording", "stopping", "review"] as const)(
    "keeps discard available during %s even when parent disables recording",
    (phase) => {
      const markup = renderControl({ phase }, true);
      expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>Discard take/);
    },
  );

  it("requires an explicit send from review and explains privacy", () => {
    const markup = renderControl({ phase: "review" });
    expect(markup).toContain("Send for analysis");
    expect(markup).toContain("Nothing sent yet");
    expect(markup).toContain("private recordings");
    expect(markup).not.toContain("🎙 Record");
    const disabled = renderControl({ phase: "review" }, true);
    expect(disabled).toMatch(/<button[^>]*disabled[^>]*>Send for analysis/);
  });
  it("offers an enabled cancellation action while recording is locked", () => {
    const markup = renderControl({ phase: "requesting" });
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>🎙 Record/);
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>Cancel microphone request/);
    expect(markup).toContain("No prompt? Cancel");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("announces actionable errors and permits retry", () => {
    const markup = renderControl({
      phase: "error",
      message: microphoneErrorMessage({ name: "NotFoundError" }),
    });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("No microphone was found");
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>🎙 Record/);
    expect(markup).not.toContain("Cancel microphone request");
  });

  it("keeps stopping available even if the parent disables new attempts", () => {
    const markup = renderControl({ phase: "recording" }, true);
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>⏹ Stop/);
    expect(markup).toContain("Recording…");
  });

  it.each(["encoding", "uploading"] as const)("locks Record during %s", (phase) => {
    const markup = renderControl(
      phase === "uploading" ? { phase, fraction: 0.5 } : { phase },
    );
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>🎙 Record/);
    expect(markup).not.toContain("Cancel microphone request");
  });

  it("does not promise safe navigation on storage upload alone", () => {
    const markup = renderControl({ phase: "done", storageKey: "private.wav" });
    expect(markup).toContain("Uploaded");
    expect(markup).toContain("Re-record");
    expect(markup).not.toContain("safe to leave");
  });

  it("names the upload progressbar", () => {
    const markup = renderControl({ phase: "uploading", fraction: 0.4 });
    const progressbar = markup.match(/<[^>]*role="progressbar"[^>]*>/)?.[0];
    expect(progressbar).toContain('aria-label="Recording upload"');
  });
});
