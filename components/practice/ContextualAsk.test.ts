import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AttemptResult } from "@/components/practice/AttemptResult";
import { ExerciseProposal } from "@/components/practice/ExerciseProposal";
import { coachingResponseSchema, FOCUS_AREAS } from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const noOp = () => undefined;

const unsavedAttempt: SessionRow = {
  id: "unsaved-attempt",
  ts: "2026-08-25T10:00:00.000Z",
  exercise_type: "scale",
  exercise_spec_json:
    '{"type":"scale","target_notes_midi":[60,62,64],"duration_per_note_s":0.5,"vowel":"ah","display_name":"Draft scale"}',
  measurements_json: "{}",
  coaching_md: "",
  coaching_json: JSON.stringify({
    focus_area: FOCUS_AREAS[0],
    state_id: "hypoadduction",
    drill_id: "staccato_onsets",
    top_issue: "Land directly on the note.",
    why: "The onset began below the target.",
    drill: "Repeat the landing.",
    encouragement: "The held pitch stayed centered.",
    resolved: {
      state_id: "hypoadduction",
      state_name: "Breathy onset",
      remediation_family: "closure",
      audible_correction: null,
      drill: {
        id: "staccato_onsets",
        name: "Staccato onsets",
        instructions: "Send each onset to the wall.",
        duration_s: 30,
      },
      cues: ["Send each onset to the wall."],
      caution: null,
      used_fallback: false,
    },
    calibrating: false,
  }),
  audio_key: "audio.wav",
  contour_json: null,
  practice_session_id: "practice-1",
  sequence_number: 2,
  parent_attempt_id: "recorded-attempt",
  attempt_kind: "retry",
};

describe("contextual asking for persisted sources", () => {
  it("does not expose contextual chat on a draft exercise proposal", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(
          ExerciseProposal as React.ComponentType<Record<string, unknown>>,
          {
            proposal: {
              spec: null,
              reason: "Sing something familiar.",
              parentAttemptId: null,
              retry: false,
            },
            accepted: false,
            processing: false,
            playing: false,
            recorderBusy: false,
            proposalLoading: false,
            onAccept: noOp,
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

    expect(markup).not.toContain("Ask about this");
  });

  it("does not expose contextual chat on an unsaved attempt result", () => {
    expect(
      coachingResponseSchema.safeParse(JSON.parse(unsavedAttempt.coaching_json!)).success,
    ).toBe(true);
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(
          AttemptResult as React.ComponentType<Record<string, unknown>>,
          {
            attempt: unsavedAttempt,
            fallbackIndex: 1,
            parent: null,
            expanded: false,
            onToggle: noOp,
          },
        ),
      ),
    );

    expect(markup).not.toContain("Explain this");
  });

  it("keeps contextual chat available for a persisted attempt result", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(AttemptResult, {
          attempt: { ...unsavedAttempt, id: "persisted-attempt" },
          fallbackIndex: 1,
          parent: null,
          expanded: false,
          onToggle: noOp,
          onAsk: noOp,
        }),
      ),
    );

    expect(markup).toContain("Explain this");
  });
});
