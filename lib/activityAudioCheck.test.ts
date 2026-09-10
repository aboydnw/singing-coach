import { describe, expect, it } from "vitest";
import { checkActivityAudio } from "../scripts/check-activity-audio.mjs";

describe("activity audio verification", () => {
  it("names the activity and missing reviewed asset", () => {
    const errors = checkActivityAudio(
      {
        activities: [
          {
            id: "breath.song",
            reference_audio: [
              {
                semitones: 0,
                src: "/audio/activities/breath-song-0.wav",
                engine: "DiffSinger",
                model: "acoustic-v1",
                voicebank: "Example Voice",
                dataset: "documented-dataset",
                output_license: "CC BY-NC-SA 4.0",
                reviewed: true,
              },
            ],
          },
        ],
      },
      "/definitely-not-the-project-root",
    );

    expect(errors).toEqual(["breath.song: missing /audio/activities/breath-song-0.wav"]);
  });

  it.each(["false", 1, undefined])(
    "rejects a non-boolean reviewed value: %s",
    (reviewed) => {
      const errors = checkActivityAudio(
        {
          activities: [
            {
              id: "unsafe",
              reference_audio: [
                {
                  semitones: 0,
                  src: "/audio/activities/missing.wav",
                  engine: "engine",
                  model: "model",
                  voicebank: "voice",
                  dataset: "dataset",
                  output_license: "license",
                  reviewed,
                },
              ],
            },
          ],
        },
        "/missing",
      );
      expect(errors).toContain("unsafe: unreviewed /audio/activities/missing.wav");
    },
  );
});
