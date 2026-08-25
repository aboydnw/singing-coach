import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExerciseNavigator } from "@/components/practice/ExerciseNavigator";
import type { ExerciseThread } from "@/lib/exerciseThreads";
import type { SessionRow } from "@/lib/sessions";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const recordedAttempt: SessionRow = {
  id: "recorded-exercise",
  ts: "2026-08-25T10:00:00.000Z",
  exercise_type: "sustained",
  exercise_spec_json:
    '{"type":"sustained","target_notes_midi":[53],"duration_per_note_s":3,"vowel":"ah","display_name":"Recorded exercise"}',
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

const recordedThread: ExerciseThread = {
  id: recordedAttempt.id,
  attempts: [recordedAttempt],
  attemptIds: [recordedAttempt.id],
};

describe("ExerciseNavigator", () => {
  it("renders no navigation when an ended practice has only a supplied draft", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(ExerciseNavigator, {
          threads: [],
          selectedExerciseId: "draft-exercise",
          draft: { id: "draft-exercise", name: "Draft exercise" },
          onSelect: () => undefined,
          onNewExercise: () => undefined,
          disabled: false,
          ended: true,
        }),
      ),
    );

    expect(markup).not.toContain('aria-label="Practice exercises"');
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("Draft exercise");
    expect(markup).not.toContain("+ New exercise");
  });

  it("shows only recorded exercise navigation when an ended practice receives a draft", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(ExerciseNavigator, {
          threads: [recordedThread],
          selectedExerciseId: recordedThread.id,
          draft: { id: "draft-exercise", name: "Draft exercise" },
          onSelect: () => undefined,
          onNewExercise: () => undefined,
          disabled: false,
          ended: true,
        }),
      ),
    );

    expect(markup).toContain("Recorded exercise");
    expect(markup).not.toContain("Draft exercise");
    expect(markup).not.toContain("+ New exercise");
  });
});
