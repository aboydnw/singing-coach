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
import { listSessions, signedAudioUrl, type SessionRow } from "@/lib/sessions";

type Filter = "all" | "exercises" | "free-sing";

export default function ProgressPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load"));
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
        {error && <Text color="coral.600">⚠️ {error}</Text>}
        {!sessions && !error && <Spinner color="coral.500" />}
        {sessions && (
          <>
            <ProgressCharts sessions={filtered} />
            <Box>
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
