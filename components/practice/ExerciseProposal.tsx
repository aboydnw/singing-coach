import { Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { Recorder } from "@/components/Recorder";
import { AttemptProgress } from "@/components/practice/AttemptProgress";
import type { RecorderState } from "@/components/Recorder";
import {
  ReferencePlaybackControl,
  type ReferencePlaybackState,
} from "@/components/practice/ReferencePlaybackControl";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { ExerciseSpec } from "@/lib/schema";

export type PracticeProposal = {
  spec: ExerciseSpec | null;
  reason: string;
  parentAttemptId: string | null;
  retry: boolean;
  keyOptions?: ExerciseSpec[];
  selectedKeyIndex?: number;
};

export function ExerciseProposal(props: {
  proposal: PracticeProposal;
  processing: boolean;
  playbackState: ReferencePlaybackState;
  recorderBusy: boolean;
  proposalLoading: boolean;
  referenceFallback?: boolean;
  onUploaded: (key: string) => void;
  onPlayReference: () => void;
  onStopReference: () => void;
  onDifferent: () => void;
  onFreeSing: () => void;
  onMoveOn: () => void;
  onShiftKey?: (direction: "lower" | "higher") => void;
  onCancel: () => void;
  onRecorderStateChange: (state: RecorderState) => void;
  compact?: boolean;
}) {
  const { proposal } = props;
  return (
    <Surface
      as="article"
      id="exercise-setup"
      tabIndex={-1}
      variant="base"
      borderColor="border.default"
      borderLeftWidth="4px"
      borderLeftColor="coaching.focus"
      p={{ base: 5, md: 6 }}
      boxShadow="none"
    >
      {!props.compact ? (
        <>
          <Eyebrow>{proposal.retry ? "Focused retry" : "Next exercise"}</Eyebrow>
          <Heading mt={2} size="lg">
            {proposal.spec?.display_name ?? "Free sing"}
          </Heading>
          <Text mt={2} color="fg.muted" lineHeight="1.7">
            {proposal.reason}
          </Text>
        </>
      ) : null}
      {proposal.spec && !props.compact ? (
        <Stack mt={3} gap={2}>
          {proposal.spec.excerpt ? (
            <Text fontWeight="semibold">“{proposal.spec.excerpt}”</Text>
          ) : null}
          {proposal.spec.instructions ? <Text>{proposal.spec.instructions}</Text> : null}
          {proposal.spec.primary_cue ? (
            <Text fontSize="sm" color="fg.muted">
              Listen for: {proposal.spec.primary_cue}
            </Text>
          ) : null}
          <Text fontSize="sm" color="fg.muted">
            {proposal.spec.target_notes_midi.length} note
            {proposal.spec.target_notes_midi.length === 1 ? "" : "s"} · “
            {proposal.spec.vowel}”
          </Text>
        </Stack>
      ) : !proposal.spec && !props.compact ? (
        <Text mt={3} fontSize="sm" color="fg.muted">
          No target notes. Pitch accuracy will not be scored.
        </Text>
      ) : null}

      <Surface variant="subtle" mt={props.compact ? 0 : 5} p={4}>
        <Stack gap={4}>
          <Text fontWeight="semibold">
            Keep one cue in mind, then record when you are ready.
          </Text>
          {proposal.spec ? (
            <ReferencePlaybackControl
              state={props.playbackState}
              referenceFallback={Boolean(props.referenceFallback)}
              disabled={props.recorderBusy || props.proposalLoading}
              onPlay={props.onPlayReference}
              onStop={props.onStopReference}
            />
          ) : null}
          {proposal.spec?.activity_kind === "song_passage" ? (
            <Flex gap={3} wrap="wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => props.onShiftKey?.("lower")}
                disabled={
                  props.recorderBusy ||
                  props.proposalLoading ||
                  proposal.selectedKeyIndex === undefined ||
                  !proposal.keyOptions?.length ||
                  proposal.selectedKeyIndex === 0
                }
              >
                Too high
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => props.onShiftKey?.("higher")}
                disabled={
                  props.recorderBusy ||
                  props.proposalLoading ||
                  proposal.selectedKeyIndex === undefined ||
                  !proposal.keyOptions?.length ||
                  proposal.selectedKeyIndex === (proposal.keyOptions?.length ?? 1) - 1
                }
              >
                Too low
              </Button>
            </Flex>
          ) : null}
          <Recorder
            onUploaded={props.onUploaded}
            onStateChange={props.onRecorderStateChange}
            disabled={props.processing || props.proposalLoading}
          />
          {!props.compact ? (
            <Flex gap={4} wrap="wrap">
              <Button
                variant="plain"
                color="fg.muted"
                px={0}
                onClick={props.onDifferent}
                loading={props.proposalLoading}
                disabled={props.processing || props.recorderBusy}
              >
                Different exercise
              </Button>
              {proposal.spec ? (
                <Button
                  variant="plain"
                  color="fg.muted"
                  px={0}
                  onClick={props.onFreeSing}
                  disabled={
                    props.processing || props.recorderBusy || props.proposalLoading
                  }
                >
                  Free sing instead
                </Button>
              ) : (
                <Button
                  variant="plain"
                  color="fg.muted"
                  px={0}
                  onClick={props.onMoveOn}
                  disabled={
                    props.processing || props.recorderBusy || props.proposalLoading
                  }
                >
                  Coach’s exercise instead
                </Button>
              )}
              {proposal.retry ? (
                <Button
                  variant="plain"
                  color="action.primary"
                  px={0}
                  onClick={props.onMoveOn}
                  disabled={
                    props.processing || props.recorderBusy || props.proposalLoading
                  }
                >
                  Move on
                </Button>
              ) : null}
              <Button
                variant="plain"
                color="fg.muted"
                px={0}
                onClick={props.onCancel}
                disabled={props.processing || props.recorderBusy}
              >
                Cancel
              </Button>
            </Flex>
          ) : null}
          {props.processing ? <AttemptProgress /> : null}
        </Stack>
      </Surface>
    </Surface>
  );
}
