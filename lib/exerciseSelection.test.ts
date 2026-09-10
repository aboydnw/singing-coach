import { describe, expect, it } from "vitest";
import { nextExercise } from "@/lib/exercises";
import { exerciseSignature, selectVariedExercise } from "@/lib/exerciseSelection";
import type { Calibration, ExerciseSpec } from "@/lib/schema";

const CALIBRATION: Calibration = {
  range_low_midi: 48,
  range_high_midi: 72,
  tessitura_low_midi: 55,
  tessitura_high_midi: 64,
};

function row(spec: ExerciseSpec, practiceSessionId = "older-practice") {
  return {
    exercise_spec_json: JSON.stringify(spec),
    practice_session_id: practiceSessionId,
  };
}

describe("selectVariedExercise", () => {
  it("avoids exact exercises used in recent practices", () => {
    const history = [
      row(nextExercise(CALIBRATION, 0)),
      row(nextExercise(CALIBRATION, 1)),
    ];

    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: null,
      history,
    });

    expect(history.map((entry) => entry.exercise_spec_json)).not.toContain(
      JSON.stringify(selected.spec),
    );
  });

  it("retains a relevant focus while changing the exact exercise", () => {
    const firstScale = nextExercise(CALIBRATION, 0, "pitch_accuracy");

    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: "pitch_accuracy",
      history: [row(firstScale)],
    });

    expect(selected.spec.type).toBe("scale");
    expect(exerciseSignature(selected.spec)).not.toBe(exerciseSignature(firstScale));
  });

  it("uses rows from another practice when enforcing novelty", () => {
    const earlier = nextExercise(CALIBRATION, 0, "tone_quality");

    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: "tone_quality",
      history: [row(earlier, "previous-practice")],
    });

    expect(exerciseSignature(selected.spec)).not.toBe(exerciseSignature(earlier));
  });

  it("keeps a requested drill type and name without repeating its notes", () => {
    const earlier = nextExercise(CALIBRATION, 0, null);

    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: null,
      preferredType: "sustained",
      drillName: "Straw phonation",
      history: [row(earlier)],
    });

    expect(selected.spec.type).toBe("sustained");
    expect(selected.spec.display_name).toContain("drill: Straw phonation");
    expect(exerciseSignature(selected.spec)).not.toBe(exerciseSignature(earlier));
  });

  it("prefers the faithful catalog activity for a requested drill", () => {
    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: null,
      preferredDrillId: "staccato_onsets",
      preferredType: "sustained",
      drillName: "Staccato 'hey' onsets",
      history: [],
    });

    expect(selected.spec.activity_id).toBe("staccato_onsets.basic");
    expect(selected.spec.vowel).toBe("hey");
    expect(selected.spec.events?.some((event) => event.kind === "rest")).toBe(true);
  });

  it("ignores malformed and Free Sing history", () => {
    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: null,
      history: [
        { exercise_spec_json: null, practice_session_id: "free-sing" },
        { exercise_spec_json: "not json", practice_session_id: "broken" },
      ],
    });

    expect(selected.spec).toEqual(nextExercise(CALIBRATION, 0, null));
  });

  it("penalizes matching notes even when catalogue identity differs", () => {
    const generated = nextExercise(CALIBRATION, 0, "tone_quality");
    const catalogueLike = {
      ...generated,
      activity_id: "catalogue.same-notes",
      activity_version: 2,
    };
    const selected = selectVariedExercise({
      calibration: CALIBRATION,
      cursor: 0,
      focusArea: "tone_quality",
      history: [row(catalogueLike)],
    });
    expect(selected.spec.target_notes_midi).not.toEqual(generated.target_notes_midi);
  });
});
