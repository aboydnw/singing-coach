import type { StartingDirection, LearningContract } from "@/lib/schema";
// Mirrors the canonical web starting contract, without importing its browser client.
export function initialContract(direction: StartingDirection): LearningContract {
  const presets: Record<
    StartingDirection,
    Pick<LearningContract, "focus" | "listenFor" | "tryCue" | "readyWhen">
  > = {
    coach_pick: {
      focus: "Find one useful pattern to work on",
      listenFor: "What feels repeatable and what changes between attempts",
      tryCue: "Make the sound easy to notice, not perfect",
      readyWhen: "The first attempt gives us a clear pattern",
    },
    pitch: {
      focus: "Land cleanly on the target pitch",
      listenFor: "A note that begins at its destination instead of sliding toward it",
      tryCue: "Place the note on a shelf across the room",
      readyWhen: "Two starts arrive near the target without a corrective slide",
    },
    steadiness: {
      focus: "Keep the sound even from beginning to end",
      listenFor: "A tone that does not wobble or fade unexpectedly",
      tryCue: "Send one unbroken ribbon of sound across the room",
      readyWhen: "Two attempts keep a similar shape throughout the note",
    },
    tone: {
      focus: "Find a clear, consistent tone",
      listenFor: "The same vowel color from the start of the note to the end",
      tryCue: "Aim the vowel toward the far wall",
      readyWhen: "The vowel remains recognizable across two attempts",
    },
    free_sing: {
      focus: "Notice what your voice naturally does today",
      listenFor: "A moment that feels easy and a moment that asks for more effort",
      tryCue: "Sing something familiar without trying to fix it yet",
      readyWhen: "You have a passage worth exploring more closely",
    },
  };
  return {
    focusArea:
      direction === "pitch"
        ? "pitch_accuracy"
        : direction === "steadiness"
          ? "breath_support"
          : direction === "tone"
            ? "tone_quality"
            : null,
    ...presets[direction],
    avoid: null,
    strength: null,
    updatedAfterAttemptId: null,
    confidence: "early",
  };
}
