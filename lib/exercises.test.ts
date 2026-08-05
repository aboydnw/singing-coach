import { describe, expect, it } from "vitest";
import cases from "../tests/fixtures/exercise_parity.json";
import { isSameExercise, midiToName, nextExercise, skipExercise } from "./exercises";
import type { Calibration, FocusArea } from "./schema";

describe("nextExercise parity with exercises.py", () => {
  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const spec = nextExercise(
      c.calibration,
      c.session_index,
      (c.focus_area as FocusArea | null) ?? null,
    );
    expect(spec).toEqual(c.expected);
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
