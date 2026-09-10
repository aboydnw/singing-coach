import { describe, expect, it } from "vitest";
import { nextLessonStage } from "@/lib/lessonStage";

const technical = JSON.stringify({ activity_kind: "technical" });
const song = JSON.stringify({ activity_kind: "song_passage" });

describe("lesson stage", () => {
  it("starts with technical work and applies it to a song after two exercises", () => {
    expect(nextLessonStage([])).toBe("technical");
    expect(nextLessonStage([{ exercise_spec_json: technical }])).toBe("technical");
    expect(
      nextLessonStage([
        { exercise_spec_json: technical },
        { exercise_spec_json: technical },
      ]),
    ).toBe("song_application");
  });

  it("returns to contrasting technical work after a song", () => {
    expect(
      nextLessonStage([
        { exercise_spec_json: technical },
        { exercise_spec_json: technical },
        { exercise_spec_json: song },
      ]),
    ).toBe("technical");
  });

  it("treats legacy scored exercises as technical", () => {
    const legacy = JSON.stringify({ type: "scale" });
    expect(
      nextLessonStage([{ exercise_spec_json: legacy }, { exercise_spec_json: legacy }]),
    ).toBe("song_application");
  });
});
