import { Badge, Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { memo, useMemo } from "react";
import { Drill } from "@/components/Drill";
import { HearItRight } from "@/components/HearItRight";
import { PitchChart } from "@/components/PitchChart";
import { Scorecard } from "@/components/Scorecard";
import { ContextAction } from "@/components/ui/ContextAction";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import {
  coachingResponseSchema,
  contourSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";
import { parseStoredJson } from "@/lib/storedJson";

type AttemptResultProps = {
  attempt: SessionRow;
  number: number;
  parent: SessionRow | null;
  expanded: boolean;
  onToggle: () => void;
  onAsk: (label: string, value: string) => void;
};

export const AttemptResult = memo(function AttemptResult(props: AttemptResultProps) {
  const coaching = useMemo(
    () => parseStoredJson(props.attempt.coaching_json, coachingResponseSchema),
    [props.attempt.coaching_json],
  );
  const measurements = useMemo(
    () => parseStoredJson(props.attempt.measurements_json, measurementsSchema),
    [props.attempt.measurements_json],
  );
  const contour = useMemo(
    () => parseStoredJson(props.attempt.contour_json, contourSchema),
    [props.attempt.contour_json],
  );
  const spec = useMemo(
    () => parseStoredJson(props.attempt.exercise_spec_json, exerciseSpecSchema),
    [props.attempt.exercise_spec_json],
  );
  const parentCents = props.parent ? centsFrom(props.parent) : null;
  const currentCents =
    typeof measurements?.accuracy?.mean_abs_cents_off === "number"
      ? measurements.accuracy.mean_abs_cents_off
      : null;
  const delta =
    parentCents !== null && currentCents !== null
      ? Math.round(parentCents - currentCents)
      : null;
  return (
    <Surface
      as="article"
      id={`attempt-${props.attempt.id}`}
      tabIndex={-1}
      overflow="hidden"
      style={{ contentVisibility: "auto" }}
    >
      <Box p={{ base: 5, md: 6 }}>
        <Flex justify="space-between" gap={3} wrap="wrap">
          <Box>
            <Text color="fg.muted" fontSize="sm">
              {props.parent ? "Focused retry" : `Attempt ${props.number}`}
            </Text>
            <Heading mt={1} size="md">
              {spec?.display_name ?? "Free sing"}
            </Heading>
          </Box>
          {delta !== null ? (
            <Badge colorPalette={delta > 0 ? "teal" : "gray"} variant="subtle">
              {delta > 0
                ? `${delta} cents closer`
                : delta < 0
                  ? `${Math.abs(delta)} cents farther`
                  : "Similar landing"}
            </Badge>
          ) : null}
        </Flex>
        {coaching ? (
          <Stack mt={5} gap={4}>
            <Box
              bg="coaching.surface"
              borderLeftWidth="3px"
              borderColor="coaching.focus"
              px={4}
              py={3}
              rounded="inner"
            >
              <Eyebrow>One thing to notice</Eyebrow>
              <Text mt={1} fontWeight="semibold" fontSize="lg">
                {coaching.top_issue}
              </Text>
              <Text mt={2} color="fg.default" lineHeight="1.7">
                {coaching.why}
              </Text>
              <ContextAction
                onClick={() =>
                  props.onAsk(
                    "Coach’s correction",
                    `${coaching.top_issue}. ${coaching.why}`,
                  )
                }
              />
            </Box>
            <Box>
              <Eyebrow tone="agency">Strength</Eyebrow>
              <Text mt={1}>{coaching.encouragement}</Text>
            </Box>
          </Stack>
        ) : null}
        <Button
          mt={5}
          variant="outline"
          size="sm"
          colorPalette="teal"
          onClick={props.onToggle}
        >
          {props.expanded ? "Hide full analysis" : "View full analysis"}
        </Button>
      </Box>
      {props.expanded && measurements && contour ? (
        <Stack
          borderTopWidth="1px"
          borderColor="border.default"
          p={{ base: 5, md: 6 }}
          gap={5}
          bg="bg.subtle"
        >
          <PitchChart contour={contour} spec={spec} ghost={null} />
          <Scorecard measurements={measurements} />
          {coaching?.resolved ? <Drill resolved={coaching.resolved} /> : null}
          {coaching?.resolved?.audible_correction && props.attempt.audio_key ? (
            <HearItRight
              audioKey={props.attempt.audio_key}
              correction={coaching.resolved.audible_correction}
            />
          ) : null}
        </Stack>
      ) : null}
    </Surface>
  );
}, sameAttemptResultProps);

function sameAttemptResultProps(
  previous: AttemptResultProps,
  next: AttemptResultProps,
): boolean {
  return (
    previous.attempt === next.attempt &&
    previous.parent === next.parent &&
    previous.number === next.number &&
    previous.expanded === next.expanded
  );
}

function centsFrom(attempt: SessionRow): number | null {
  const value = parseStoredJson(attempt.measurements_json, measurementsSchema)?.accuracy
    ?.mean_abs_cents_off;
  return typeof value === "number" ? value : null;
}
