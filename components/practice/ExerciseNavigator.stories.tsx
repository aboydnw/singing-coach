import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExerciseNavigator } from "@/components/practice/ExerciseNavigator";
import { groupExerciseThreads } from "@/lib/exerciseThreads";
import type { SessionRow } from "@/lib/sessions";

function attempt({
  id,
  sequence,
  name,
  outcome,
  parentId = null,
}: {
  id: string;
  sequence: number;
  name: string;
  outcome: string;
  parentId?: string | null;
}): SessionRow {
  return {
    id,
    ts: `2026-08-24T10:0${sequence}:00.000Z`,
    exercise_type: "sustained",
    exercise_spec_json: JSON.stringify({
      type: "sustained",
      target_notes_midi: [53],
      duration_per_note_s: 3,
      vowel: "ah",
      display_name: name,
    }),
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: JSON.stringify({ top_issue: outcome }),
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: sequence,
    parent_attempt_id: parentId,
    attempt_kind: parentId ? "retry" : "initial",
  };
}

const threads = groupExerciseThreads([
  attempt({
    id: "sustain-root",
    sequence: 1,
    name: "Sustain ‘ah’ on F3",
    outcome: "Keep the pitch centered through the final second.",
  }),
  attempt({
    id: "sustain-retry",
    sequence: 2,
    name: "Sustain ‘ah’ on F3",
    outcome: "The release is easier; keep the vibrato speed even.",
    parentId: "sustain-root",
  }),
  attempt({
    id: "scale-root",
    sequence: 3,
    name: "Five-note scale on ‘oo’",
    outcome: "Let the middle notes stay as buoyant as the first.",
  }),
]);

const meta = {
  title: "Practice/ExerciseNavigator",
  component: ExerciseNavigator,
  args: {
    threads,
    selectedExerciseId: "scale-root",
    onSelect: () => undefined,
    onNewExercise: () => undefined,
    disabled: false,
    ended: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "18rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExerciseNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecordedExercises: Story = {};

export const SelectedDraft: Story = {
  args: {
    draft: { id: "draft-exercise", name: "Lip trill through a gentle octave" },
    selectedExerciseId: "draft-exercise",
  },
};

export const MobileCompatibleLongNames: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  args: {
    threads: groupExerciseThreads([
      attempt({
        id: "long-name-root",
        sequence: 1,
        name: "Descending five-note scale on ‘noo’ with an easy, speech-like onset",
        outcome: "Keep the consonant light so the vowel can stay resonant.",
      }),
      attempt({
        id: "free-root",
        sequence: 2,
        name: "Free sing",
        outcome: "The phrase stayed connected even through the softer ending.",
      }),
    ]),
    selectedExerciseId: "long-name-root",
  },
};

export const EndedPractice: Story = {
  args: {
    draft: { id: "draft-exercise", name: "This draft must not appear" },
    ended: true,
  },
};
