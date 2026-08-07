import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppNotice } from "@/components/ui/AppNotice";

const meta = {
  title: "UI/AppNotice",
  component: AppNotice,
  args: {
    title: "Analysis saved, coaching unavailable",
    children: "Your measurements are preserved. Retry coaching when you are ready.",
  },
} satisfies Meta<typeof AppNotice>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Information: Story = { args: { tone: "info" } };
export const Success: Story = { args: { tone: "success", title: "Practice saved" } };
export const Warning: Story = {
  args: { tone: "warning", title: "Listen for discomfort" },
};
export const Danger: Story = {
  args: { tone: "danger", title: "Could not load practice" },
};
export const PartialSuccess: Story = {
  args: { tone: "partial", title: "Results available, session not saved" },
};
