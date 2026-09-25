import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";

const meta = {
  title: "Account/DeleteAccountSection",
  component: DeleteAccountSection,
  args: { busy: false, error: null, onDelete: () => undefined },
} satisfies Meta<typeof DeleteAccountSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Failed: Story = {
  args: { error: "Something went wrong partway through. Try again." },
};
