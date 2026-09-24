import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthCard, SetPasswordForm, SignInPanel } from "@/components/auth/AuthForms";

const noOp = () => undefined;

const meta = {
  title: "Auth/SignInPanel",
  component: SignInPanel,
  args: {
    mode: "sign-in",
    busy: false,
    notice: null,
    onModeChange: noOp,
    onSubmit: noOp,
    onGoogle: noOp,
  },
} satisfies Meta<typeof SignInPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
export const SignUp: Story = { args: { mode: "sign-up" } };
export const ForgotPassword: Story = { args: { mode: "forgot" } };
export const Busy: Story = { args: { busy: true } };
export const WrongPassword: Story = {
  args: {
    notice: {
      tone: "danger",
      title: "Couldn't sign in",
      body: "That email and password don't match. Try again, or reset your password.",
    },
  },
};
export const ResetSent: Story = {
  args: {
    mode: "forgot",
    notice: {
      tone: "success",
      title: "Check your email",
      body: "If an account exists for that address, a reset link is on its way.",
    },
  },
};
export const ChooseNewPassword: Story = {
  render: () => (
    <AuthCard
      heading="Choose a new password"
      lead="You're signed in. Pick a password for next time."
    >
      <SetPasswordForm
        busy={false}
        notice={null}
        submitLabel="Save password"
        onSubmit={noOp}
      />
    </AuthCard>
  ),
};
