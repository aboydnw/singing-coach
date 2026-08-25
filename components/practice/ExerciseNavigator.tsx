import { Box, Button, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import { exerciseNavigationSummary, type ExerciseThread } from "@/lib/exerciseThreads";

type ExerciseDraft = {
  id: string;
  name: string;
};

type ExerciseNavigatorProps = {
  threads: ExerciseThread[];
  selectedExerciseId: string | null;
  draft?: ExerciseDraft;
  onSelect: (exerciseId: string) => void;
  onNewExercise: () => void;
  disabled: boolean;
  ended: boolean;
};

export function ExerciseNavigator(props: ExerciseNavigatorProps) {
  const draft = props.ended ? undefined : props.draft;
  if (props.threads.length === 0 && !draft && props.ended) return null;

  return (
    <>
      <Surface
        as="nav"
        aria-label="Practice exercises"
        display={{ base: "none", lg: "block" }}
        position="sticky"
        top="5.5rem"
        p={3}
      >
        <Stack gap={2}>
          <Box px={2} pt={1} pb={2}>
            <Eyebrow tone="agency">Exercises</Eyebrow>
          </Box>
          {!props.ended ? (
            <Button
              colorPalette="coral"
              size="sm"
              onClick={props.onNewExercise}
              disabled={props.disabled}
            >
              + New exercise
            </Button>
          ) : null}
          {props.threads.map((thread, index) => {
            const selected = thread.id === props.selectedExerciseId;
            const summary = exerciseNavigationSummary(thread, index);
            return (
              <Button
                key={thread.id}
                variant="plain"
                h="auto"
                minH="5.5rem"
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
                onClick={() => props.onSelect(thread.id)}
              >
                <Box minW={0}>
                  <Text fontSize="xs" color="fg.muted" fontWeight="semibold">
                    {summary.label}
                  </Text>
                  <Text mt={0.5} fontSize="sm" fontWeight="semibold">
                    {summary.name}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="1.35">
                    {summary.attemptCount} · {summary.outcome}
                  </Text>
                </Box>
              </Button>
            );
          })}
          {draft ? (
            <Button
              variant="plain"
              h="auto"
              minH="4.75rem"
              justifyContent="start"
              textAlign="left"
              whiteSpace="normal"
              borderLeftWidth="3px"
              borderLeftColor={
                draft.id === props.selectedExerciseId ? "singer.agency" : "transparent"
              }
              bg={
                draft.id === props.selectedExerciseId ? "singer.surface" : "transparent"
              }
              px={3}
              py={2}
              aria-current={draft.id === props.selectedExerciseId ? "true" : undefined}
              disabled={props.disabled}
              onClick={() => props.onSelect(draft.id)}
            >
              <Box minW={0}>
                <Text fontSize="xs" color="fg.muted" fontWeight="semibold">
                  Draft exercise
                </Text>
                <Text mt={0.5} fontSize="sm" fontWeight="semibold">
                  {draft.name}
                </Text>
              </Box>
            </Button>
          ) : null}
        </Stack>
      </Surface>

      <Surface display={{ base: "block", lg: "none" }} p={3}>
        <Stack gap={3}>
          <Box>
            <label htmlFor="practice-exercise-select">
              <Text fontSize="sm">Exercise</Text>
            </label>
            <NativeSelect.Root mt={1} disabled={props.disabled}>
              <NativeSelect.Field
                id="practice-exercise-select"
                value={props.selectedExerciseId ?? ""}
                onChange={(event) => props.onSelect(event.target.value)}
              >
                {props.threads.map((thread, index) => {
                  const summary = exerciseNavigationSummary(thread, index);
                  return (
                    <option key={thread.id} value={thread.id}>
                      {summary.label} · {summary.name} · {summary.attemptCount}
                    </option>
                  );
                })}
                {draft ? (
                  <option value={draft.id}>Draft exercise · {draft.name}</option>
                ) : null}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
          {!props.ended ? (
            <Button
              colorPalette="coral"
              size="sm"
              onClick={props.onNewExercise}
              disabled={props.disabled}
            >
              + New exercise
            </Button>
          ) : null}
        </Stack>
      </Surface>
    </>
  );
}
