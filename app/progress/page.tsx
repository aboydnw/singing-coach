"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { ProgressCharts } from "@/components/ProgressCharts";
import { Shell } from "@/components/Shell";
import { AppNotice } from "@/components/ui/AppNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSurface } from "@/components/ui/LoadingSurface";
import { listPractices, type PracticeSessionRow } from "@/lib/practice";
import { listSessions, signedAudioUrl, type SessionRow } from "@/lib/sessions";
import { useRouter } from "next/navigation";

type Filter = "all" | "exercises" | "free-sing";

export default function ProgressPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [practices, setPractices] = useState<PracticeSessionRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load"));
    listPractices(100)
      .then((rows) => setPractices(rows.filter((row) => row.status === "ended")))
      .catch((e) => {
        setPractices([]);
        setPracticeError(e instanceof Error ? e.message : "failed to load practices");
      });
  }, []);

  const filtered = (sessions ?? []).filter((row) =>
    filter === "all"
      ? true
      : filter === "free-sing"
        ? row.exercise_type === "free_sing"
        : row.exercise_type !== "free_sing",
  );

  const play = async (row: SessionRow) => {
    if (!row.audio_key) return;
    setPlayingId(row.id);
    const url = await signedAudioUrl(row.audio_key);
    if (url) {
      const audio = new Audio(url);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      void audio.play();
    } else {
      setPlayingId(null);
    }
  };

  return (
    <Shell>
      <Stack gap={6}>
        <Heading size="lg" color="ink.900">
          Progress
        </Heading>
        {error ? (
          <AppNotice tone="danger" title="Could not load progress">
            {error}
          </AppNotice>
        ) : null}
        {practiceError ? (
          <AppNotice tone="danger" title="Practice history is unavailable">
            Your attempt charts are still available. {practiceError}
          </AppNotice>
        ) : null}
        {!sessions && !error ? <LoadingSurface lines={6} /> : null}
        {sessions && (
          <>
            <ProgressCharts sessions={filtered} />
            {practices ? (
              <Box>
                <Heading size="md" mb={3}>
                  Practice history
                </Heading>
                {practices.length === 0 ? (
                  <EmptyState title="No completed practice yet">
                    End a practice session to see its attempts grouped here.
                  </EmptyState>
                ) : (
                  <Stack gap={2}>
                    {practices.map((practice) => {
                      const attempts = sessions.filter(
                        (row) => row.practice_session_id === practice.id,
                      );
                      return (
                        <Button
                          key={practice.id}
                          variant="outline"
                          borderColor="grid"
                          bg="panel"
                          height="auto"
                          py={4}
                          px={4}
                          justifyContent="space-between"
                          textAlign="left"
                          onClick={() => router.push(`/practice/${practice.id}`)}
                        >
                          <Box>
                            <Text fontWeight="semibold">
                              {new Date(practice.started_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                            <Text
                              mt={1}
                              color="cream.700"
                              fontWeight="normal"
                              whiteSpace="normal"
                            >
                              {practice.summary_json?.focus ??
                                practice.learning_contract_json?.focus ??
                                "Practice session"}{" "}
                              · {attempts.length} attempt
                              {attempts.length === 1 ? "" : "s"}
                            </Text>
                            {practice.summary_json?.change ? (
                              <Text
                                mt={1}
                                color="teal.700"
                                fontSize="sm"
                                fontWeight="normal"
                                whiteSpace="normal"
                              >
                                {practice.summary_json.change}
                              </Text>
                            ) : null}
                          </Box>
                          <Text color="coral.600" ml={4}>
                            Review →
                          </Text>
                        </Button>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            ) : (
              <LoadingSurface lines={3} />
            )}
            <Box>
              <Heading size="md" mb={3}>
                All attempts
              </Heading>
              <Flex gap={2} mb={3}>
                {(["all", "exercises", "free-sing"] as const).map((f) => (
                  <Button
                    key={f}
                    size="xs"
                    variant={filter === f ? "solid" : "outline"}
                    colorPalette="coral"
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </Button>
                ))}
              </Flex>
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row bg="transparent">
                    <Table.ColumnHeader>when</Table.ColumnHeader>
                    <Table.ColumnHeader>exercise</Table.ColumnHeader>
                    <Table.ColumnHeader>coaching</Table.ColumnHeader>
                    <Table.ColumnHeader>audio</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filtered.map((row) => (
                    <Table.Row key={row.id} bg="transparent">
                      <Table.Cell whiteSpace="nowrap">
                        {new Date(row.ts).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell>
                        {specName(row) ?? row.exercise_type.replace("_", " ")}
                      </Table.Cell>
                      <Table.Cell maxW="72" truncate>
                        {coachingHeadline(row) ?? "—"}
                      </Table.Cell>
                      <Table.Cell>
                        {row.audio_key ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="teal"
                            onClick={() => play(row)}
                            disabled={playingId === row.id}
                          >
                            {playingId === row.id ? "▶ playing" : "▶ play"}
                          </Button>
                        ) : (
                          <Text color="cream.600" fontSize="xs">
                            not available
                          </Text>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </>
        )}
      </Stack>
    </Shell>
  );
}

function specName(row: SessionRow): string | null {
  if (!row.exercise_spec_json) return null;
  try {
    return JSON.parse(row.exercise_spec_json).display_name ?? null;
  } catch {
    return null;
  }
}

function coachingHeadline(row: SessionRow): string | null {
  if (!row.coaching_json) return null;
  try {
    return JSON.parse(row.coaching_json).top_issue ?? null;
  } catch {
    return null;
  }
}
