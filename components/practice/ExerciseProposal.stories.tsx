import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExerciseProposal } from "@/components/practice/ExerciseProposal";

const proposal = {
  spec: {
    type: "scale" as const,
    target_notes_midi: [60, 62, 64, 65, 67],
    duration_per_note_s: 0.5,
    vowel: "ah",
    display_name: "Five-note scale on ‘ah’",
  },
  reason:
    "This keeps the landing easy to hear while asking the voice to move between notes.",
  parentAttemptId: null,
  retry: false,
};

const meta = {
  title: "Practice/ExerciseProposal",
  component: ExerciseProposal,
  args: {
    proposal,
    accepted: false,
    processing: false,
    playing: false,
    onAccept: () => undefined,
    onUploaded: () => undefined,
    onHear: () => undefined,
    onDifferent: () => undefined,
    onFreeSing: () => undefined,
    onMoveOn: () => undefined,
    onAsk: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "44rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExerciseProposal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Proposed: Story = {};
export const Accepted: Story = { args: { accepted: true } };
export const FocusedRetry: Story = {
  args: { proposal: { ...proposal, retry: true, parentAttemptId: "attempt-1" } },
};
export const FreeSing: Story = {
  args: {
    proposal: {
      spec: null,
      reason: "Sing something familiar and notice what changes without target notes.",
      parentAttemptId: null,
      retry: false,
    },
  },
};
