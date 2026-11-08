import type { PracticeSessionRow } from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

// Synthetic content only. Never use private recordings or account data in stories.
const focus =
  "Your notes are landing **below the target** on several notes. The sound is steadier after the opening, so keep that steadiness while listening for a clearer landing.\n\n**What to listen for**\n\n- An easy, direct start\n- A steady vowel through the note\n- A clean finish without pushing";
export const coachingPractice: PracticeSessionRow = {
  id: "example-practice",
  user_id: "example",
  started_at: "",
  ended_at: null,
  status: "in_progress",
  starting_direction: "coach_pick",
  summary_json: null,
  created_at: "",
  updated_at: "",
  learning_contract_json: {
    focusArea: "pitch_accuracy",
    focus,
    listenFor: "An easy, direct start",
    tryCue: "Let the note land on a shelf across the room.",
    avoid: "Do not push for volume.",
    strength: "Your sustained vowel stays **clear and steady**.",
    readyWhen: "Two comfortable, direct landings",
    updatedAfterAttemptId: null,
    confidence: "developing",
  },
};
export const coachingAttempt: SessionRow = {
  id: "example-attempt",
  ts: "",
  exercise_type: "sustained",
  exercise_spec_json: null,
  measurements_json: "{}",
  coaching_md: "",
  audio_key: null,
  contour_json: null,
  practice_session_id: "example-practice",
  sequence_number: 1,
  parent_attempt_id: null,
  attempt_kind: "initial",
  coaching_json: JSON.stringify({
    focus_area: "pitch_accuracy",
    state_id: "example",
    drill_id: "example",
    top_issue: focus,
    why: "An uneven opening can make it harder to find the target. Compare the opening with the steadier part of the note, and use that difference as a listening guide. This is one attempt, so it is a starting point rather than a verdict about your voice.",
    drill: "Use the selected exercise.",
    encouragement: "Your sustained vowel stays **clear and steady**.",
    resolved: {
      state_id: "example",
      state_name: "Example",
      remediation_family: "Example",
      audible_correction: null,
      used_fallback: false,
      drill: {
        id: "example",
        name: "Easy landing",
        instructions: "Repeat the selected note comfortably.",
        duration_s: 30,
      },
      cues: ["Let the note land on a shelf across the room."],
      caution: "Keep it comfortable. Stop if you feel strain.",
    },
  }),
};
