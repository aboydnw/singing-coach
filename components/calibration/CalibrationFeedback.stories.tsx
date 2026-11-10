import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  CalibrationFeedback,
  CalibrationPitchStatus,
  type CalibrationNotice,
} from "@/components/calibration/CalibrationFeedback";

const meta = {
  title: "Calibration/Feedback",
  component: CalibrationFeedback,
  args: { notice: null },
  parameters: {
    docs: {
      description: {
        component:
          "Synthetic calibration feedback only. No sign-in, microphone, upload, or analysis calls. Error and success regions remain mounted; each pitch status names its slot and announces only its own changes.",
      },
    },
  },
} satisfies Meta<typeof CalibrationFeedback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const MissingRecording: Story = {
  args: {
    notice: {
      tone: "danger",
      message: "Still need a clear recording for: Lowest comfortable note.",
    },
  },
};
export const ReversedRange: Story = {
  args: {
    notice: {
      tone: "danger",
      message: "Expected: low edge ≤ low comfortable ≤ high comfortable ≤ high edge.",
    },
  },
};
export const FailedAnalysis: Story = {
  args: { notice: { tone: "danger", message: "analysis failed" } },
};
export const Saved: Story = {
  args: {
    notice: {
      tone: "success",
      message: "Saved. Range: C3–C5; tessitura: G3–E4.",
    },
  },
};

export const PitchStates: Story = {
  render: () => (
    <Stack gap={5}>
      <CalibrationPitchStatus
        label="Lowest comfortable note"
        detecting={false}
        midi={null}
      />
      <CalibrationPitchStatus
        label="Highest comfortable note"
        detecting={true}
        midi={null}
      />
      <CalibrationPitchStatus
        label="Lowest note you can reach"
        detecting={false}
        midi={48}
      />
    </Stack>
  ),
};

function FeedbackTransitions() {
  const [detecting, setDetecting] = useState(false);
  const [midi, setMidi] = useState<number | null>(null);
  const [notice, setNotice] = useState<CalibrationNotice | null>(null);
  return (
    <Box maxW="md">
      <Text>Synthetic feedback. Use these controls to check repeated announcements.</Text>
      <Flex gap={3} wrap="wrap" mt={4}>
        <Button
          onClick={() => {
            setDetecting(true);
            setNotice(null);
          }}
        >
          Detect
        </Button>
        <Button
          onClick={() => {
            setDetecting(false);
            setMidi(55);
          }}
        >
          Pitch found
        </Button>
        <Button
          onClick={() => {
            setDetecting(false);
            setMidi(null);
            setNotice({
              tone: "danger",
              message:
                'No clear pitch detected for "Lowest comfortable note" — try again.',
            });
          }}
        >
          No clear pitch
        </Button>
        <Button
          onClick={() => {
            setDetecting(false);
            setNotice({
              tone: "success",
              message: "Saved. Range: C3–C5; tessitura: G3–E4.",
            });
          }}
        >
          Saved
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDetecting(false);
            setMidi(null);
            setNotice(null);
          }}
        >
          Reset
        </Button>
      </Flex>
      <CalibrationPitchStatus
        label="Lowest comfortable note"
        detecting={detecting}
        midi={midi}
      />
      <CalibrationFeedback notice={notice} />
    </Box>
  );
}

export const RepeatedTransitions: Story = { render: () => <FeedbackTransitions /> };
