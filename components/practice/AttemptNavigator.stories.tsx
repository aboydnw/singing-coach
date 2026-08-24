import type { Meta, StoryObj } from "@storybook/react-vite";
import { AttemptNavigator } from "@/components/practice/AttemptNavigator";
import type { SessionRow } from "@/lib/sessions";

const attempts: SessionRow[] = [
  {
    id: "attempt-1",
    ts: "2026-08-24T10:00:00.000Z",
    exercise_type: "sustained",
    exercise_spec_json: JSON.stringify({
      type: "sustained",
      target_notes_midi: [53],
      duration_per_note_s: 3,
      vowel: "ah",
      display_name: "Sustain ‘ah’ on F3",
    }),
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: JSON.stringify({
      top_issue: "Keep the pitch centered through the final second.",
    }),
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: 1,
    parent_attempt_id: null,
    attempt_kind: "initial",
  },
  {
    id: "attempt-2",
    ts: "2026-08-24T10:04:00.000Z",
    exercise_type: "sustained",
    exercise_spec_json: JSON.stringify({
      type: "sustained",
      target_notes_midi: [53],
      duration_per_note_s: 3,
      vowel: "ah",
      display_name: "Sustain ‘ah’ on F3",
    }),
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: JSON.stringify({
      top_issue: "The vibrato is narrower; keep its speed even as the note fades.",
    }),
    audio_key: null,
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: 2,
    parent_attempt_id: "attempt-1",
    attempt_kind: "retry",
  },
];

const meta = {
  title: "Practice/AttemptNavigator",
  component: AttemptNavigator,
  args: {
    attempts,
    selectedAttemptId: "attempt-2",
    onSelect: () => undefined,
    onNewAttempt: () => undefined,
    disabled: false,
    ended: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "16rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttemptNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveRetry: Story = {};
export const Ended: Story = { args: { ended: true } };
export const Processing: Story = { args: { disabled: true } };
