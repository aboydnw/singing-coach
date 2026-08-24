import { Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { Recorder } from "@/components/Recorder";
import type { RecorderState } from "@/components/Recorder";
import { ContextAction } from "@/components/ui/ContextAction";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { ExerciseSpec } from "@/lib/schema";

export type PracticeProposal = {
  spec: ExerciseSpec | null;
  reason: string;
  parentAttemptId: string | null;
  retry: boolean;
};

export function ExerciseProposal(props: {
  proposal: PracticeProposal;
  accepted: boolean;
  processing: boolean;
  playing: boolean;
  recorderBusy: boolean;
  onAccept: () => void;
  onUploaded: (key: string) => void;
  onHear: () => void;
  onDifferent: () => void;
  onFreeSing: () => void;
  onMoveOn: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onRecorderStateChange: (state: RecorderState) => void;
}) {
  const { proposal, accepted } = props;
  return (
    <Surface
      as="article"
      id="exercise-setup"
      tabIndex={-1}
      variant={accepted ? "raised" : "base"}
      borderColor={accepted ? "coral.300" : "border.default"}
      borderLeftWidth="4px"
      borderLeftColor="coaching.focus"
      p={{ base: 5, md: 6 }}
      boxShadow={accepted ? "active" : "none"}
    >
      <Eyebrow>{proposal.retry ? "Focused retry" : "Next exercise"}</Eyebrow>
      <Heading mt={2} size="lg">
        {proposal.spec?.display_name ?? "Free sing"}
      </Heading>
      <Text mt={2} color="fg.muted" lineHeight="1.7">
        {proposal.reason}
      </Text>
      {proposal.spec ? (
        <Text mt={3} fontSize="sm" color="fg.muted">
          {proposal.spec.target_notes_midi.length} note
          {proposal.spec.target_notes_midi.length === 1 ? "" : "s"} · “
          {proposal.spec.vowel}” · {proposal.spec.duration_per_note_s}s each
        </Text>
      ) : (
        <Text mt={3} fontSize="sm" color="fg.muted">
          No target notes. Pitch accuracy will not be scored.
        </Text>
      )}

      {!accepted ? (
        <Stack mt={5} gap={3}>
          <Flex gap={3} wrap="wrap">
            <Button colorPalette="coral" onClick={props.onAccept}>
              {proposal.retry ? "Try it now" : "Start this exercise"}
            </Button>
            {proposal.spec ? (
              <Button
                variant="outline"
                colorPalette="teal"
                onClick={props.onHear}
                loading={props.playing}
              >
                Hear it
              </Button>
            ) : null}
          </Flex>
          <Flex gap={4} wrap="wrap">
            <ContextAction onClick={props.onAsk}>Ask about this</ContextAction>
            <Button variant="plain" color="fg.muted" px={0} onClick={props.onDifferent}>
              Different exercise
            </Button>
            {proposal.spec ? (
              <Button variant="plain" color="fg.muted" px={0} onClick={props.onFreeSing}>
                Free sing instead
              </Button>
            ) : (
              <Button variant="plain" color="fg.muted" px={0} onClick={props.onMoveOn}>
                Coach’s exercise instead
              </Button>
            )}
            {proposal.retry ? (
              <Button
                variant="plain"
                color="action.primary"
                px={0}
                onClick={props.onMoveOn}
              >
                Move on
              </Button>
            ) : null}
            <Button variant="plain" color="fg.muted" px={0} onClick={props.onCancel}>
              Cancel
            </Button>
          </Flex>
        </Stack>
      ) : (
        <Surface variant="subtle" mt={5} p={4}>
          <Stack gap={4}>
            <Text fontWeight="semibold">
              Keep one cue in mind, then record when you are ready.
            </Text>
            {proposal.spec ? (
              <Button
                alignSelf="start"
                variant="outline"
                colorPalette="teal"
                onClick={props.onHear}
                loading={props.playing}
                disabled={props.recorderBusy}
              >
                Hear the reference
              </Button>
            ) : null}
            <Recorder
              onUploaded={props.onUploaded}
              onStateChange={props.onRecorderStateChange}
              disabled={props.processing}
            />
            <Button
              alignSelf="start"
              variant="plain"
              color="fg.muted"
              px={0}
              onClick={props.onCancel}
              disabled={props.processing || props.recorderBusy}
            >
              Cancel
            </Button>
            {props.processing ? (
              <Text color="singer.agency" role="status">
                Listening for the pattern and preparing one useful correction…
              </Text>
            ) : null}
          </Stack>
        </Surface>
      )}
    </Surface>
  );
}
