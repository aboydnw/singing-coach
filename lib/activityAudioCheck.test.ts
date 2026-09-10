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
                voice: "Example Voice",
                license: "CC BY-NC-SA 4.0",
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
});
