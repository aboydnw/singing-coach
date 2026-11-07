import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { RecorderControls, type RecorderState } from "@/components/Recorder";
import { microphoneErrorMessage } from "@/lib/recorder";

const meta = {
  title: "Audio/Recorder",
  component: RecorderControls,
  args: {
    state: { phase: "idle" },
    onStart: () => undefined,
    onStop: () => undefined,
    onCancelRequest: () => undefined,
    onDiscard: () => undefined,
    onSubmit: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "38rem" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Recorder states use fixtures only. These stories do not request microphone access, record audio, or upload anything.",
      },
    },
  },
} satisfies Meta<typeof RecorderControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const WaitingForMicrophone: Story = { args: { state: { phase: "requesting" } } };
export const Recording: Story = { args: { state: { phase: "recording" } } };
export const Stopping: Story = { args: { state: { phase: "stopping" } } };
export const Review: Story = { args: { state: { phase: "review" } } };
export const Preparing: Story = { args: { state: { phase: "encoding" } } };
export const Uploading: Story = {
  args: { state: { phase: "uploading", fraction: 0.4 } },
};
export const Uploaded: Story = {
  args: { state: { phase: "done", storageKey: "fixture.wav" } },
};
export const MicrophoneBlocked: Story = {
  args: {
    state: {
      phase: "error",
      message: microphoneErrorMessage({ name: "NotAllowedError" }),
    },
  },
};
export const NoMicrophone: Story = {
  args: {
    state: { phase: "error", message: microphoneErrorMessage({ name: "NotFoundError" }) },
  },
};
export const MicrophoneBusy: Story = {
  args: {
    state: {
      phase: "error",
      message: microphoneErrorMessage({ name: "NotReadableError" }),
    },
  },
};
export const UploadFailed: Story = {
  args: { state: { phase: "error", message: "Upload timed out. Please try again." } },
};

export const CancelAndTryAgain: Story = {
  render: function Recovery(args) {
    const [state, setState] = useState<RecorderState>({ phase: "idle" });
    return (
      <RecorderControls
        {...args}
        state={state}
        onStart={() => setState({ phase: "requesting" })}
        onCancelRequest={() => setState({ phase: "idle" })}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const record = canvas.getByRole("button", { name: /Record/ });
    await userEvent.click(record);
    await expect(record).toBeDisabled();
    const cancel = canvas.getByRole("button", { name: "Cancel microphone request" });
    cancel.focus();
    await userEvent.keyboard("{Enter}");
    await expect(record).toBeEnabled();
    await expect(record).toHaveFocus();
    await expect(canvas.getByRole("status")).toHaveTextContent("Ready when you are");
    await userEvent.keyboard("{Enter}");
    await expect(record).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Cancel microphone request" }),
    ).toBeEnabled();
  },
};

export const DiscardAndConfirm: Story = {
  render: function TakeFlow(args) {
    const [state, setState] = useState<RecorderState>({ phase: "idle" });
    return (
      <RecorderControls
        {...args}
        state={state}
        onStart={() => setState({ phase: "recording" })}
        onStop={() => setState({ phase: "review" })}
        onDiscard={() => setState({ phase: "idle" })}
        onSubmit={() => setState({ phase: "uploading", fraction: 0.4 })}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Record/ }));
    const discard = canvas.getByRole("button", { name: "Discard take" });
    discard.focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("button", { name: /Record/ })).toHaveFocus();
    await expect(canvas.getByRole("status")).toHaveTextContent("Nothing was sent");
    await userEvent.keyboard("{Enter}");
    await userEvent.dblClick(canvas.getByRole("button", { name: /Stop/ }));
    await expect(canvas.getByRole("button", { name: "Send for analysis" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Discard take" }));
    await expect(canvas.getByRole("button", { name: /Record/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    canvas.getByRole("button", { name: /Stop/ }).focus();
    await userEvent.keyboard("{Enter>3/}");
    await expect(canvas.getByRole("status")).toHaveTextContent("Nothing sent yet");
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("status")).toHaveTextContent("Uploading");
    await expect(
      canvas.queryByRole("button", { name: "Discard take" }),
    ).not.toBeInTheDocument();
  },
};
