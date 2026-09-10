export type LessonStage = "technical" | "song_application";

export function nextLessonStage(
  attempts: { exercise_spec_json: string | null }[],
): LessonStage {
  let technicalSinceSong = 0;
  for (const attempt of attempts) {
    if (!attempt.exercise_spec_json) {
      technicalSinceSong = 0;
      continue;
    }
    try {
      const value = JSON.parse(attempt.exercise_spec_json) as {
        activity_kind?: string;
        type?: string;
      };
      if (value.activity_kind === "song_passage") {
        technicalSinceSong = 0;
      } else if (value.activity_kind === "technical" || value.type) {
        technicalSinceSong += 1;
      }
    } catch {
      // Malformed history should not move the lesson into repertoire.
    }
  }
  return technicalSinceSong >= 2 ? "song_application" : "technical";
}
