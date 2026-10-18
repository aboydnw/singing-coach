import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReferencePlaybackControl } from "@/components/practice/ReferencePlaybackControl";

const meta = {
  title: "Practice/ReferencePlaybackControl",
  component: ReferencePlaybackControl,
  args: {
    state: "ready",
    referenceFallback: false,
    disabled: false,
    onPlay: () => undefined,
    onStop: () => undefined,
  },
} satisfies Meta<typeof ReferencePlaybackControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Preparing: Story = { args: { state: "preparing" } };
export const Playing: Story = { args: { state: "playing" } };
export const PitchFallback: Story = {
  args: { state: "playing", referenceFallback: true },
};
export const Error: Story = { args: { state: "error" } };
