import { describe, expect, it } from "vitest";
import cases from "../tests/fixtures/exercise_parity.json";
import { midiToName, nextExercise } from "./exercises";
import type { FocusArea } from "./schema";

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

describe("midiToName", () => {
  it("matches Python's naming", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(57)).toBe("A3");
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(61)).toBe("C#4");
  });
});
