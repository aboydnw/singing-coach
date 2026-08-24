import { Box, Button, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import {
  attemptExerciseName,
  attemptNavigationLabel,
  attemptOutcome,
} from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

type AttemptNavigatorProps = {
  attempts: SessionRow[];
  selectedAttemptId: string | null;
  onSelect: (attemptId: string) => void;
  onNewAttempt: () => void;
  disabled: boolean;
  ended: boolean;
};

export function AttemptNavigator(props: AttemptNavigatorProps) {
  if (props.attempts.length === 0 && props.ended) return null;

  return (
    <>
      <Surface
        as="nav"
        aria-label="Practice attempts"
        display={{ base: "none", lg: "block" }}
        position="sticky"
        top="5.5rem"
        p={3}
      >
        <Stack gap={2}>
          <Box px={2} pt={1} pb={2}>
            <Eyebrow tone="agency">Attempts</Eyebrow>
          </Box>
          {!props.ended ? (
            <Button
              colorPalette="coral"
              size="sm"
              onClick={props.onNewAttempt}
              disabled={props.disabled}
            >
              + New attempt
            </Button>
          ) : null}
          {props.attempts.map((attempt, index) => {
            const selected = attempt.id === props.selectedAttemptId;
            return (
              <Button
                key={attempt.id}
                variant="plain"
                h="auto"
                minH="4.75rem"
                justifyContent="start"
                textAlign="left"
                whiteSpace="normal"
                borderLeftWidth="3px"
                borderLeftColor={selected ? "singer.agency" : "transparent"}
                bg={selected ? "singer.surface" : "transparent"}
                px={3}
                py={2}
                aria-current={selected ? "true" : undefined}
                disabled={props.disabled}
                onClick={() => props.onSelect(attempt.id)}
              >
                <Box minW={0}>
                  <Text fontSize="xs" color="fg.muted" fontWeight="semibold">
                    {attemptNavigationLabel(attempt, index)}
                  </Text>
                  <Text mt={0.5} fontSize="sm" fontWeight="semibold">
                    {attemptExerciseName(attempt)}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="1.35">
                    {attemptOutcome(attempt)}
                  </Text>
                </Box>
              </Button>
            );
          })}
        </Stack>
      </Surface>

      <Surface display={{ base: "block", lg: "none" }} p={3}>
        <Stack gap={3}>
          <Box>
            <label htmlFor="practice-attempt-select">
              <Text fontSize="sm">Attempt</Text>
            </label>
            <NativeSelect.Root mt={1} disabled={props.disabled}>
              <NativeSelect.Field
                id="practice-attempt-select"
                value={props.selectedAttemptId ?? ""}
                onChange={(event) => props.onSelect(event.target.value)}
              >
                {props.attempts.map((attempt, index) => (
                  <option key={attempt.id} value={attempt.id}>
                    {attemptNavigationLabel(attempt, index)} ·{" "}
                    {attemptExerciseName(attempt)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
          {!props.ended ? (
            <Button
              colorPalette="coral"
              size="sm"
              onClick={props.onNewAttempt}
              disabled={props.disabled}
            >
              + New attempt
            </Button>
          ) : null}
        </Stack>
      </Surface>
    </>
  );
}
