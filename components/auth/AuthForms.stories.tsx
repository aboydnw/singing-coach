import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignInPanel } from "@/components/auth/AuthForms";

const noOp = () => undefined;

const meta = {
  title: "Auth/SignInPanel",
  component: SignInPanel,
  args: {
    busy: false,
    notice: null,
    onGoogle: noOp,
  },
} satisfies Meta<typeof SignInPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Google: Story = {};
export const Busy: Story = { args: { busy: true } };
export const Cancelled: Story = {
  args: {
    notice: {
      tone: "danger",
      title: "Couldn't sign you in",
      body: "Sign-in was cancelled. Try again.",
    },
  },
};
export const AccountDeleted: Story = {
  args: { notice: { tone: "success", title: "Your account has been deleted" } },
};
export const EmailFallback: Story = { args: { onEmailSignIn: noOp } };
