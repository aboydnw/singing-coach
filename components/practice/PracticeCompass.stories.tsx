import type { Meta, StoryObj } from "@storybook/react-vite";
import { PracticeCompass } from "@/components/practice/PracticeCompass";

const contract = {
  focusArea: "pitch_accuracy" as const,
  focus: "Land directly on the target pitch",
  listenFor: "A note that begins at its destination instead of sliding upward",
  tryCue: "Place the note on a shelf across the room",
  avoid: "Do not add volume to force the landing",
  strength: "The sustained vowel remains clear after the onset",
  readyWhen: "Two attempts begin near the target without a corrective slide",
  updatedAfterAttemptId: "attempt-2",
  confidence: "developing" as const,
};

const meta = {
  title: "Practice/PracticeCompass",
  component: PracticeCompass,
  args: { contract, onAsk: () => undefined },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "22rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PracticeCompass>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Developing: Story = {};
export const Early: Story = {
  args: { contract: { ...contract, confidence: "early", strength: null, avoid: null } },
};
export const Supported: Story = {
  args: { contract: { ...contract, confidence: "supported" } },
};
