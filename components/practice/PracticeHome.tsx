"use client";

import {
  Badge,
  Box,
  Button,
  Dialog,
  Grid,
  Heading,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CoachSnapshot } from "@/components/practice/CoachSnapshot";
import { AppNotice } from "@/components/ui/AppNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { LoadingSurface } from "@/components/ui/LoadingSurface";
import { Surface } from "@/components/ui/Surface";
import type { StartingDirection } from "@/lib/schema";
import { practiceResumeSummary, replaceActivePractice } from "@/lib/practiceHome";
import {
  STARTING_DIRECTION_LABELS,
  createPractice,
  endPractice,
  listPractices,
  loadPractice,
  type PracticeSessionRow,
} from "@/lib/practice";

const DIRECTIONS: Array<{
  id: StartingDirection;
  symbol: string;
  description: string;
}> = [
  {
    id: "coach_pick",
    symbol: "✦",
    description: "Begin with the most useful direction from your recent practice.",
  },
  { id: "pitch", symbol: "↗", description: "Land and hold notes more accurately." },
  { id: "steadiness", symbol: "—", description: "Keep pitch and volume more even." },
  { id: "tone", symbol: "◯", description: "Explore clarity and vowel consistency." },
  {
    id: "free_sing",
    symbol: "≈",
    description: "Sing something familiar and see what appears.",
  },
];

export function PracticeHome() {
  const router = useRouter();
  const [selected, setSelected] = useState<StartingDirection>("coach_pick");
  const [active, setActive] = useState<PracticeSessionRow | null>(null);
  const [practices, setPractices] = useState<PracticeSessionRow[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [newPracticeOpen, setNewPracticeOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setPractices(null);
    try {
      const rows = await listPractices();
      setActive(rows.find((row) => row.status === "in_progress") ?? null);
      setPractices(rows.filter((row) => row.status === "ended"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load practice.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const practice = await createPractice(selected);
      router.push(`/practice/${practice.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start practice.");
      setStarting(false);
    }
  };

  const replacePractice = async () => {
    if (!active) return;
    setStarting(true);
    setError(null);
    try {
      const practice = await replaceActivePractice(active.id, selected, {
        load: async (id) => {
          const loaded = await loadPractice(id);
          if (!loaded.practice.learning_contract_json) {
            throw new Error("This practice is missing its coaching plan.");
          }
          return {
            attempts: loaded.attempts,
            contract: loaded.practice.learning_contract_json,
          };
        },
        end: endPractice,
        create: createPractice,
      });
      router.push(`/practice/${practice.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start practice.");
      setStarting(false);
      setNewPracticeOpen(false);
    }
  };

  return (
    <Stack gap={{ base: 7, md: 10 }}>
      <Box maxW="44rem">
        <Eyebrow>Your practice room</Eyebrow>
        <Heading
          mt={2}
          fontSize={{ base: "2rem", md: "3.25rem" }}
          lineHeight="0.98"
          letterSpacing="-0.04em"
        >
          Learn to hear what your voice is doing.
        </Heading>
        <Text
          mt={4}
          color="cream.700"
          fontSize={{ base: "sm", md: "lg" }}
          maxW="38rem"
          lineHeight="1.7"
        >
          Take one focused attempt, notice the pattern, and try the change while the sound
          is still fresh.
        </Text>
      </Box>

      {error ? (
        <AppNotice tone="danger" title="Could not load practice">
          {error}
          <Button mt={3} size="sm" variant="outline" onClick={load}>
            Try again
          </Button>
        </AppNotice>
      ) : null}

      <Grid
        templateColumns={{ base: "1fr", lg: "minmax(0, 1.7fr) minmax(17rem, .8fr)" }}
        gap={6}
        alignItems="start"
      >
        <Surface variant="raised" p={{ base: 5, md: 7 }}>
          {practices === null ? (
            error ? null : (
              <LoadingSurface lines={4} />
            )
          ) : active ? (
            <Stack gap={5}>
              <Stack gap={2}>
                <Badge alignSelf="start" colorPalette="teal" variant="subtle">
                  In progress
                </Badge>
                <Heading size="xl" letterSpacing="-0.025em">
                  Continue where you left off
                </Heading>
                <Text color="cream.600" fontSize="sm">
                  Started {formatRelative(active.started_at)}
                </Text>
                <Text color="cream.700" lineClamp={3}>
                  {practiceResumeSummary(active.learning_contract_json)}
                </Text>
              </Stack>
              <Stack direction={{ base: "column", sm: "row" }} gap={3}>
                <Button
                  size="lg"
                  colorPalette="coral"
                  onClick={() => router.push(`/practice/${active.id}`)}
                >
                  Continue practice →
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setNewPracticeOpen(true)}
                >
                  Start new practice
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack gap={6}>
              <Box>
                <Text color="cream.600" fontWeight="semibold" fontSize="sm">
                  Start practice
                </Text>
                <Heading mt={1} size="xl" letterSpacing="-0.025em">
                  What should we listen for today?
                </Heading>
              </Box>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                {DIRECTIONS.map((direction, index) => {
                  const isSelected = direction.id === selected;
                  return (
                    <Button
                      key={direction.id}
                      variant="outline"
                      height="auto"
                      justifyContent="start"
                      textAlign="left"
                      whiteSpace="normal"
                      px={4}
                      py={4}
                      borderColor={isSelected ? "coral.400" : "grid"}
                      bg={isSelected ? "coral.50" : "cream.50"}
                      color="ink.900"
                      gridColumn={{ sm: index === 0 ? "1 / -1" : "auto" }}
                      onClick={() => setSelected(direction.id)}
                      aria-pressed={isSelected}
                    >
                      <Box
                        as="span"
                        fontSize="xl"
                        color={isSelected ? "coral.600" : "teal.600"}
                        mr={3}
                      >
                        {direction.symbol}
                      </Box>
                      <Box as="span">
                        <Text as="span" display="block" fontWeight="semibold">
                          {STARTING_DIRECTION_LABELS[direction.id]}
                        </Text>
                        <Text
                          as="span"
                          display="block"
                          mt={1}
                          color="cream.700"
                          fontSize="sm"
                          fontWeight="normal"
                        >
                          {direction.description}
                        </Text>
                      </Box>
                    </Button>
                  );
                })}
              </SimpleGrid>
              <Button
                size="lg"
                colorPalette="coral"
                alignSelf={{ base: "stretch", sm: "start" }}
                onClick={start}
                loading={starting}
                loadingText="Opening your practice…"
              >
                Start with {STARTING_DIRECTION_LABELS[selected].toLowerCase()} →
              </Button>
            </Stack>
          )}
        </Surface>

        <CoachSnapshot latest={practices?.[0] ?? null} />
      </Grid>

      <Box>
        <Heading size="lg" letterSpacing="-0.02em">
          Recent practice
        </Heading>
        {practices === null ? (
          error ? null : (
            <Stack gap={3} mt={4}>
              <Skeleton height="24" />
              <Skeleton height="24" />
            </Stack>
          )
        ) : practices.length === 0 ? (
          <Box mt={4}>
            <EmptyState title="No completed practice yet">
              Completed practices will collect here as a record of what you noticed and
              changed.
            </EmptyState>
          </Box>
        ) : (
          <Surface mt={4} overflow="hidden">
            <Stack gap={0}>
              {practices.map((practice, index) => (
                <Button
                  key={practice.id}
                  variant="ghost"
                  height="auto"
                  px={5}
                  py={4}
                  rounded="none"
                  justifyContent="space-between"
                  borderTopWidth={index === 0 ? "0" : "1px"}
                  borderColor="grid"
                  onClick={() => router.push(`/practice/${practice.id}`)}
                >
                  <Box textAlign="left" minW="0">
                    <FlexLine>
                      <Text fontWeight="semibold">{formatDate(practice.started_at)}</Text>
                      <Text color="cream.500">
                        {practice.summary_json
                          ? `${practice.summary_json.attemptCount} attempt${practice.summary_json.attemptCount === 1 ? "" : "s"}`
                          : "Ended"}
                      </Text>
                    </FlexLine>
                    <Text
                      mt={1}
                      color="cream.700"
                      fontWeight="normal"
                      whiteSpace="normal"
                      lineClamp={2}
                    >
                      {practice.summary_json?.focus ??
                        practice.learning_contract_json?.focus ??
                        "Practice session"}
                    </Text>
                  </Box>
                  <Text color="coral.600" ml={4} flex="0 0 auto">
                    Review →
                  </Text>
                </Button>
              ))}
            </Stack>
          </Surface>
        )}
      </Box>

      <Dialog.Root
        open={newPracticeOpen}
        onOpenChange={(event) => setNewPracticeOpen(event.open)}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content rounded="xl" mx={4}>
            <Dialog.Header>
              <Dialog.Title>Start a new practice?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Text color="cream.700">
                  This will end your current practice and save its progress before opening
                  a new one.
                </Text>
                <Button
                  variant="ghost"
                  justifyContent="start"
                  px={0}
                  onClick={() => setFocusOpen((open) => !open)}
                  aria-expanded={focusOpen}
                >
                  {focusOpen ? "Hide focus choices" : "Choose a different focus"}
                </Button>
                {focusOpen ? (
                  <SimpleGrid columns={{ base: 1, sm: 2 }} gap={2}>
                    {DIRECTIONS.map((direction) => (
                      <Button
                        key={direction.id}
                        variant="outline"
                        minH="12"
                        whiteSpace="normal"
                        borderColor={selected === direction.id ? "coral.400" : "grid"}
                        bg={selected === direction.id ? "coral.50" : "cream.50"}
                        onClick={() => setSelected(direction.id)}
                        aria-pressed={selected === direction.id}
                      >
                        {STARTING_DIRECTION_LABELS[direction.id]}
                      </Button>
                    ))}
                  </SimpleGrid>
                ) : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">Keep current practice</Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="coral"
                onClick={replacePractice}
                loading={starting}
                loadingText="Saving and starting…"
              >
                Save and start new
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Stack>
  );
}

function FlexLine({ children }: { children: React.ReactNode }) {
  return (
    <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
      {children}
    </Box>
  );
}

function formatRelative(value: string): string {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? `today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : formatDate(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
