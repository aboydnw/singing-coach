"use client";

import { Box, Button, Flex, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { SessionRow } from "@/lib/sessions";

export function AttemptHistoryTable({
  attempts,
  playingId,
  onPlay,
}: {
  attempts: SessionRow[];
  playingId: string | null;
  onPlay: (attempt: SessionRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Box display={{ base: "none", md: "block" }} maxW="100%" overflowX="auto">
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
            {attempts.map((attempt) => (
              <Table.Row key={attempt.id} bg="transparent">
                <Table.Cell whiteSpace="nowrap">
                  {formatDate(attempt.ts, false)}
                </Table.Cell>
                <Table.Cell>{exerciseName(attempt)}</Table.Cell>
                <Table.Cell maxW="24rem" whiteSpace="normal" overflowWrap="anywhere">
                  {coachingHeadline(attempt)}
                </Table.Cell>
                <Table.Cell>
                  <AudioAction attempt={attempt} playingId={playingId} onPlay={onPlay} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <Stack display={{ base: "flex", md: "none" }} gap={2} minW="0">
        {attempts.map((attempt) => {
          const coaching = coachingHeadline(attempt);
          const isExpanded = expanded.has(attempt.id);
          const canExpand = coaching !== "—" && coaching.length > 48;
          return (
            <Box
              key={attempt.id}
              bg="panel"
              borderWidth="1px"
              borderColor="grid"
              rounded="surface"
              px={3.5}
              py={3}
              minW="0"
            >
              <Flex align="start" justify="space-between" gap={3} minW="0">
                <Box minW="0">
                  <Text fontWeight="semibold" lineHeight="short" overflowWrap="anywhere">
                    {exerciseName(attempt)}
                  </Text>
                  <Text mt={1} color="cream.600" fontSize="xs">
                    {formatDate(attempt.ts, true)}
                  </Text>
                </Box>
                <AudioAction attempt={attempt} playingId={playingId} onPlay={onPlay} />
              </Flex>
              <Box mt={3} pt={3} borderTopWidth="1px" borderColor="grid" minW="0">
                <Text
                  color="cream.800"
                  fontSize="sm"
                  lineHeight="tall"
                  lineClamp={!isExpanded && canExpand ? 2 : undefined}
                  overflowWrap="anywhere"
                >
                  {coaching}
                </Text>
                {canExpand ? (
                  <Button
                    mt={1}
                    size="xs"
                    variant="plain"
                    colorPalette="coral"
                    px={0}
                    height="auto"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(attempt.id)}
                  >
                    {isExpanded ? "Show less" : "More"}
                  </Button>
                ) : null}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </>
  );
}

function AudioAction({
  attempt,
  playingId,
  onPlay,
}: {
  attempt: SessionRow;
  playingId: string | null;
  onPlay: (attempt: SessionRow) => void;
}) {
  if (!attempt.audio_key) {
    return (
      <Text color="cream.600" fontSize="xs" whiteSpace="nowrap">
        no audio
      </Text>
    );
  }
  return (
    <Button
      size="xs"
      variant="outline"
      colorPalette="teal"
      flexShrink={0}
      onClick={() => onPlay(attempt)}
      disabled={playingId === attempt.id}
    >
      {playingId === attempt.id ? "Playing" : "Play"}
    </Button>
  );
}

function formatDate(value: string, compact: boolean): string {
  const date = new Date(value);
  return compact
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleString();
}

function exerciseName(attempt: SessionRow): string {
  if (attempt.exercise_spec_json) {
    try {
      const name = JSON.parse(attempt.exercise_spec_json).display_name;
      if (typeof name === "string" && name) return name;
    } catch {}
  }
  return attempt.exercise_type.replace("_", " ");
}

function coachingHeadline(attempt: SessionRow): string {
  if (attempt.coaching_json) {
    try {
      const headline = JSON.parse(attempt.coaching_json).top_issue;
      if (typeof headline === "string" && headline) return headline;
    } catch {}
  }
  return "—";
}
