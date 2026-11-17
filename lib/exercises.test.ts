import { describe, expect, it } from "vitest";
import cases from "../tests/fixtures/exercise_parity.json";
import {
  exerciseForDrill,
  TYPE_ROTATION,
  isSameExercise,
  midiToName,
  nextExercise,
  skipExercise,
  skipFromCursor,
} from "./exercises";
import type { Calibration, ExerciseSpec, FocusArea } from "./schema";

describe("nextExercise historical parity and safe narrow-range fixtures", () => {
  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const spec = nextExercise(
      c.calibration,
      c.session_index,
      (c.focus_area as FocusArea | null) ?? null,
    );
    expect(spec).toEqual(c.expected);
  });
});

describe("incomplete tessitura fallback", () => {
  it.each([
    { tessitura_low_midi: null, tessitura_high_midi: 64 },
    { tessitura_low_midi: 55, tessitura_high_midi: null },
    { tessitura_low_midi: null, tessitura_high_midi: null },
  ])("uses absolute range for missing bounds", (partial) => {
    const spec = nextExercise(
      { range_low_midi: 48, range_high_midi: 72, ...partial },
      1,
      null,
    );
    expect(Math.min(...spec.target_notes_midi)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...spec.target_notes_midi)).toBeLessThanOrEqual(72);
  });
});

const CALIBRATION: Calibration = {
  range_low_midi: 48,
  range_high_midi: 72,
  tessitura_low_midi: 55,
  tessitura_high_midi: 64,
};

describe("skipExercise", () => {
  it("always hands back a different drill", () => {
    for (let index = 0; index < 20; index++) {
      const current = nextExercise(CALIBRATION, index, null);
      const { spec } = skipExercise(CALIBRATION, index, current);
      expect(isSameExercise(spec, current)).toBe(false);
    }
  });

  it("escapes an exercise the coach's focus area pinned", () => {
    const pinned = nextExercise(CALIBRATION, 5, "pitch_accuracy");
    expect(pinned.type).toBe("scale");
    const { spec } = skipExercise(CALIBRATION, 5, pinned);
    expect(isSameExercise(spec, pinned)).toBe(false);
  });

  it("keeps skipping to new drills when called repeatedly", () => {
    let current = nextExercise(CALIBRATION, 0, null);
    let index = 0;
    const seen = [current.type];
    for (let i = 0; i < 3; i++) {
      const result = skipExercise(CALIBRATION, index, current);
      expect(isSameExercise(result.spec, current)).toBe(false);
      current = result.spec;
      index = result.index;
      seen.push(current.type);
    }
    expect(new Set(seen).size).toBe(4);
  });

  it("returns the index the next skip should walk on from", () => {
    const current = nextExercise(CALIBRATION, 7, null);
    const { index } = skipExercise(CALIBRATION, 7, current);
    expect(index).toBeGreaterThan(7);
  });
});

describe("skipFromCursor", () => {
  it("walks forward across six skips instead of bouncing between two drills", () => {
    let cursor = 3;
    let current: ExerciseSpec | null = nextExercise(CALIBRATION, cursor, null);
    const seen = [current.display_name];
    for (let i = 0; i < 6; i++) {
      const result = skipFromCursor(CALIBRATION, cursor, current);
      expect(isSameExercise(result.spec, current!)).toBe(false);
      current = result.spec;
      cursor = result.index;
      seen.push(current.display_name);
    }
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  it("oscillates between two drills when the cursor is not carried forward", () => {
    const frozen = 3;
    let current = nextExercise(CALIBRATION, frozen, null);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      current = skipFromCursor(CALIBRATION, frozen, current).spec;
      seen.add(current.display_name);
    }
    expect(seen.size).toBe(2);
  });

  it("starts the walk at the cursor when there is no current exercise", () => {
    const result = skipFromCursor(CALIBRATION, 4, null);
    expect(result.index).toBe(4);
    expect(result.spec).toEqual(nextExercise(CALIBRATION, 4, null));
  });
});

describe("isSameExercise", () => {
  it("ignores a display name that only differs by the coach's focus suffix", () => {
    const plain = nextExercise(CALIBRATION, 5, null);
    const focused = nextExercise(CALIBRATION, 5, "pitch_accuracy");
    expect(plain.display_name).not.toBe(focused.display_name);
    expect(isSameExercise(plain, focused)).toBe(true);
  });
});

describe("midiToName", () => {
  it("matches Python's naming", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(57)).toBe("A3");
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(61)).toBe("C#4");
  });
});

describe("calibrated range boundaries", () => {
  it.each([0, 1, 3, 7, 11])(
    "keeps repeated skips bounded and safe for span %i",
    (width) => {
      const calibration: Calibration = {
        range_low_midi: 57,
        range_high_midi: 57 + width,
        tessitura_low_midi: null,
        tessitura_high_midi: null,
      };
      let current = nextExercise(calibration, 0);
      let cursor = 0;
      for (let step = 0; step < 32; step++) {
        const selected = skipFromCursor(calibration, cursor, current);
        expect(selected.index).toBeGreaterThan(cursor);
        expect(selected.index).toBeLessThanOrEqual(cursor + TYPE_ROTATION.length);
        expect(
          selected.spec.target_notes_midi.every(
            (note) => note >= 57 && note <= 57 + width,
          ),
        ).toBe(true);
        current = selected.spec;
        cursor = selected.index;
      }
    },
  );

  it("fits every requested drill or uses an unlinked sustained fallback", () => {
    for (let width = 0; width <= 24; width++) {
      const calibration: Calibration = {
        range_low_midi: 57,
        range_high_midi: 57 + width,
        tessitura_low_midi: null,
        tessitura_high_midi: null,
      };
      for (const type of TYPE_ROTATION) {
        for (let index = 0; index < 32; index++) {
          const spec = exerciseForDrill(calibration, index, type, "Curated drill");
          const requiredSpan = { sustained: 0, scale: 7, arpeggio: 12, siren: 12 }[type];
          const fits = width >= requiredSpan;
          expect(spec.type).toBe(fits ? type : "sustained");
          if (fits) {
            expect(spec.display_name).toContain("(drill: Curated drill)");
            expect(spec.range_fallback).toBeUndefined();
          } else {
            expect(spec.display_name).not.toContain("Curated drill");
            expect(spec.range_fallback).toBe(true);
            expect(spec.target_notes_midi).toHaveLength(1);
            expect(spec.duration_per_note_s).toBe(3);
          }
          expect(
            spec.target_notes_midi.every(
              (n) => Number.isInteger(n) && n >= 57 && n <= 57 + width,
            ),
          ).toBe(true);
          if (type === "siren" && fits) {
            const notes = spec.target_notes_midi;
            expect(notes[0]).toBe(notes[4]);
            expect(notes[1]).toBe(notes[3]);
            expect(notes[2]).toBeGreaterThanOrEqual(notes[1]);
            expect(notes[1]).toBeGreaterThanOrEqual(notes[0]);
          }
        }
      }
    }
  });

  it("uses a sustained note instead of singing below range", () => {
    expect(
      nextExercise(
        {
          range_low_midi: 57,
          range_high_midi: 60,
          tessitura_low_midi: null,
          tessitura_high_midi: null,
        },
        3,
      ).target_notes_midi,
    ).toEqual([57]);
  });

  it("clamps stale tessitura to the absolute range", () => {
    for (const tessitura of [
      [30, 40],
      [80, 90],
    ]) {
      const spec = nextExercise(
        {
          range_low_midi: 57,
          range_high_midi: 60,
          tessitura_low_midi: tessitura[0],
          tessitura_high_midi: tessitura[1],
        },
        0,
      );
      expect(spec.target_notes_midi[0]).toBeGreaterThanOrEqual(57);
      expect(spec.target_notes_midi[0]).toBeLessThanOrEqual(60);
    }
  });
});
