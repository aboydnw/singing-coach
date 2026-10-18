import type { Meta, StoryObj } from "@storybook/react-vite";
import { MobileTabBar } from "@/components/MobileTabBar";

const meta = {
  title: "Navigation/MobileTabBar",
  component: MobileTabBar,
  args: { currentPath: "/practice/session-1" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "24rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MobileTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PracticeActive: Story = {};
export const ProgressActive: Story = { args: { currentPath: "/progress" } };
