import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingAttempt } from "@/components/practice/PendingAttempt";
import type { AttemptJobRow } from "@/lib/attemptJobs";

const job: AttemptJobRow = {
  id: "example-job",
  user_id: "example-user",
  practice_session_id: "example-practice",
  audio_key: "example/take.wav",
  status: "coaching",
  exercise_spec_json: null,
  proposal_metadata_json: null,
  parent_attempt_id: null,
  attempt_kind: "initial",
  attempt_id: null,
  measurements_json: null,
  contour_json: null,
  workflow_run_id: null,
  error_code: null,
  error_message: null,
  created_at: "2026-11-07T12:00:00Z",
  updated_at: "2026-11-07T12:00:00Z",
  completed_at: null,
};
const meta = {
  title: "Practice/PendingAttempt",
  component: PendingAttempt,
  args: { job, contract: null, onRetry: () => undefined, onNewAttempt: () => undefined },
} satisfies Meta<typeof PendingAttempt>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Coaching: Story = {};
export const Queued: Story = { args: { job: { ...job, status: "queued" } } };
export const Analyzing: Story = { args: { job: { ...job, status: "analyzing" } } };
export const Failed: Story = {
  args: {
    job: {
      ...job,
      status: "failed",
      error_message: "Coaching could not finish. Your analysis is saved.",
    },
  },
};
export const Completed: Story = { args: { job: { ...job, status: "completed" } } };
