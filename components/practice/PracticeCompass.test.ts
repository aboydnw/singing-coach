import { describe, expect, it } from "vitest";
import { practiceCompassFields } from "@/components/practice/PracticeCompass";
import type { LearningContract } from "@/lib/schema";

const contract: LearningContract = {
  focusArea: "pitch_accuracy",
  focus: "Land directly on the target pitch",
  listenFor: "A note that begins at its destination",
  tryCue: "Place the note on a shelf across the room",
  avoid: null,
  strength: "The vowel stayed clear.",
  readyWhen: "Two starts arrive near the target",
  updatedAfterAttemptId: "attempt-2",
  confidence: "developing",
  compass: {
    overallTrend: "Pitch starts are becoming more consistent across practices.",
    currentSession: "Today's second attempt landed closer to the target.",
    nextDirection: "Keep the cleaner onset while changing notes.",
  },
};

describe("practiceCompassFields", () => {
  it("presents exactly the trend, current session, and next direction", () => {
    expect(practiceCompassFields(contract)).toEqual([
      {
        label: "Overall trend",
        value: "Pitch starts are becoming more consistent across practices.",
      },
      {
        label: "This session",
        value: "Today's second attempt landed closer to the target.",
      },
      {
        label: "Next direction",
        value: "Keep the cleaner onset while changing notes.",
      },
    ]);
  });
});
