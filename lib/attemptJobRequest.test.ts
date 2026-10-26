import { describe, expect, it } from "vitest";
import { attemptJobRequestSchema, ownsAudioKey } from "@/lib/attemptJobRequest";

const valid = {
  practice_session_id: "11111111-1111-1111-1111-111111111101",
  audio_key: "22222222-2222-2222-2222-222222222222/take.wav",
  exercise_spec: null,
  proposal_metadata: {
    reason: "Sing something familiar.",
    activity_id: null,
    activity_version: null,
    transposition_semitones: null,
    reference_fallback: false,
  },
  parent_attempt_id: null,
  attempt_kind: "initial",
};

describe("attempt job request", () => {
  it("accepts immutable proposal context", () => {
    expect(attemptJobRequestSchema.parse(valid).attempt_kind).toBe("initial");
  });

  it("rejects an audio object outside the caller folder", () => {
    expect(ownsAudioKey(valid.audio_key, "22222222-2222-2222-2222-222222222222")).toBe(
      true,
    );
    expect(ownsAudioKey(valid.audio_key, "33333333-3333-3333-3333-333333333333")).toBe(
      false,
    );
    expect(
      ownsAudioKey(
        "22222222-2222-2222-2222-222222222222/../take.wav",
        "22222222-2222-2222-2222-222222222222",
      ),
    ).toBe(false);
  });
});
