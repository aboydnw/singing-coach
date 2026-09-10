import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExerciseProposal } from "@/components/practice/ExerciseProposal";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const noOp = () => undefined;

function renderProposal(referenceFallback = false) {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(
        ExerciseProposal as React.ComponentType<Record<string, unknown>>,
        {
          proposal: {
            spec: {
              type: "scale",
              target_notes_midi: [60, 62, 64, 65, 67],
              duration_per_note_s: 0.5,
              vowel: "ah",
              display_name: "Five-note scale on ‘ah’",
            },
            reason: "Listen once, then sing the phrase.",
            parentAttemptId: null,
            retry: false,
          },
          processing: false,
          playing: false,
          recorderBusy: false,
          proposalLoading: false,
          referenceFallback,
          onUploaded: noOp,
          onHear: noOp,
          onDifferent: noOp,
          onFreeSing: noOp,
          onMoveOn: noOp,
          onCancel: noOp,
          onRecorderStateChange: noOp,
        },
      ),
    ),
  );
}

describe("ExerciseProposal", () => {
  it("offers playback and recording without an acceptance step", () => {
    const markup = renderProposal();

    expect(markup).toContain("Hear example");
    expect(markup).toContain("Record");
    expect(markup).not.toContain("Start this exercise");
  });

  it("labels the pitch guide when vocal playback falls back", () => {
    expect(renderProposal(true)).toContain(
      "Vocal example unavailable—playing pitch guide",
    );
  });

  it("shows lyrics and key comfort controls for a song passage", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(
          ExerciseProposal as React.ComponentType<Record<string, unknown>>,
          {
            proposal: {
              spec: {
                type: "scale",
                target_notes_midi: [60, 64, 67],
                duration_per_note_s: 0.5,
                vowel: "lyrics",
                display_name: "Amazing Grace",
                activity_kind: "song_passage",
                excerpt: "Amazing grace, how sweet the sound",
              },
              reason: "Apply the same breath idea to a song.",
              parentAttemptId: null,
              retry: false,
              keyOptions: [{}, {}, {}],
              selectedKeyIndex: 1,
            },
            processing: false,
            playing: false,
            recorderBusy: false,
            proposalLoading: false,
            onUploaded: noOp,
            onHear: noOp,
            onDifferent: noOp,
            onFreeSing: noOp,
            onMoveOn: noOp,
            onShiftKey: noOp,
            onCancel: noOp,
            onRecorderStateChange: noOp,
          },
        ),
      ),
    );
    expect(markup).toContain("Amazing grace, how sweet the sound");
    expect(markup).toContain("Too high");
    expect(markup).toContain("Too low");
  });
});
