import { Box, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CoachSnapshot } from "./CoachSnapshot";
import { AttemptResult } from "./AttemptResult";
import { coachingAttempt, coachingPractice } from "./coachingReadingFixtures";

const meta = {
  title: "Practice/CoachingReading",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Snapshot: Story = {
  render: () => (
    <Box maxW="24rem" mx="auto">
      <CoachSnapshot latest={coachingPractice} />
    </Box>
  ),
};
export const Attempt: Story = {
  render: () => (
    <Box maxW="42rem" mx="auto">
      <AttemptResult
        attempt={coachingAttempt}
        parent={null}
        fallbackIndex={1}
        expanded={false}
        onToggle={() => {}}
        onAsk={() => {}}
      />
    </Box>
  ),
};
export const ShortAndEmpty: Story = {
  render: () => (
    <Stack maxW="24rem" mx="auto" gap={4}>
      <CoachSnapshot latest={null} />
      <CoachSnapshot
        latest={{
          ...coachingPractice,
          learning_contract_json: {
            ...coachingPractice.learning_contract_json!,
            focus: "An easy, direct start.",
          },
        }}
      />
    </Stack>
  ),
};
