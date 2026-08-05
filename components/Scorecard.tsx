"use client";

import { Box, Table, Text } from "@chakra-ui/react";
import type { Measurements } from "@/lib/schema";

type Level = "good" | "watch" | "work" | "none";

const DOTS: Record<Level, string> = {
  good: "🟢",
  watch: "🟡",
  work: "🔴",
  none: "–",
};

type Row = { label: string; value: string; level: Level };

/** Port of _metrics_markdown: same thresholds, same wording, same dots. */
export function buildRows(m: Measurements): Row[] {
  const rows: Row[] = [];

  if (m.accuracy && m.accuracy.mean_abs_cents_off !== null) {
    const cents = m.accuracy.mean_abs_cents_off;
    const level: Level = cents <= 25 ? "good" : cents <= 50 ? "watch" : "work";
    const word =
      level === "good" ? "on pitch" : level === "watch" ? "close" : "off pitch";
    rows.push({
      label: "Pitch accuracy",
      value: `${cents.toFixed(0)} cents off avg — ${word}`,
      level,
    });
  }

  if (m.jitter_local !== null) {
    const level: Level =
      m.jitter_local <= 0.01 ? "good" : m.jitter_local <= 0.02 ? "watch" : "work";
    rows.push({
      label: "Pitch steadiness (jitter)",
      value: m.jitter_local.toFixed(4),
      level,
    });
  }
  if (m.shimmer_local !== null) {
    const level: Level =
      m.shimmer_local <= 0.05 ? "good" : m.shimmer_local <= 0.1 ? "watch" : "work";
    rows.push({
      label: "Volume steadiness (shimmer)",
      value: m.shimmer_local.toFixed(4),
      level,
    });
  }
  if (m.hnr_mean !== null) {
    const level: Level = m.hnr_mean >= 20 ? "good" : m.hnr_mean >= 15 ? "watch" : "work";
    const note =
      level === "good" ? "clear" : level === "watch" ? "slightly breathy" : "breathy";
    rows.push({
      label: "Tone clarity (HNR)",
      value: `${m.hnr_mean.toFixed(1)} dB — ${note}`,
      level,
    });
  }

  const minimalVibrato = (m.vibrato_extent_cents ?? 0) < 20;
  if (m.vibrato_rate_hz !== null) {
    if (minimalVibrato) {
      rows.push({ label: "Vibrato", value: "minimal / straight tone", level: "none" });
    } else {
      const r = m.vibrato_rate_hz;
      const rateLevel: Level =
        r >= 5.0 && r <= 6.5 ? "good" : r >= 4.0 && r <= 7.0 ? "watch" : "work";
      rows.push({ label: "Vibrato rate", value: `${r.toFixed(1)} Hz`, level: rateLevel });
      const e = m.vibrato_extent_cents!;
      const depthLevel: Level =
        e >= 50 && e <= 100 ? "good" : e >= 20 && e <= 120 ? "watch" : "work";
      rows.push({
        label: "Vibrato depth",
        value: `${e.toFixed(0)} cents`,
        level: depthLevel,
      });
    }
  }

  if (m.f1_mean !== null && m.f2_mean !== null) {
    rows.push({
      label: "Vowel placement (F1/F2)",
      value: `${m.f1_mean.toFixed(0)} / ${m.f2_mean.toFixed(0)} Hz`,
      level: "none",
    });
  }

  return rows;
}

export function Scorecard({ measurements }: { measurements: Measurements }) {
  const rows = buildRows(measurements);
  const perNote = measurements.accuracy?.per_note ?? [];
  const showPerNote = perNote.some((n) => n.cents_off !== null);

  return (
    <Box>
      <Table.Root size="sm" variant="line">
        <Table.Header>
          <Table.Row bg="transparent">
            <Table.ColumnHeader>how you did</Table.ColumnHeader>
            <Table.ColumnHeader>value</Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.label} bg="transparent">
              <Table.Cell>{row.label}</Table.Cell>
              <Table.Cell>{row.value}</Table.Cell>
              <Table.Cell>{DOTS[row.level]}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      {showPerNote && (
        <Box mt={4}>
          <Text fontWeight="medium" mb={2} color="ink.900">
            Per-note accuracy
          </Text>
          <Table.Root size="sm" variant="line">
            <Table.Header>
              <Table.Row bg="transparent">
                <Table.ColumnHeader>target note</Table.ColumnHeader>
                <Table.ColumnHeader>cents off</Table.ColumnHeader>
                <Table.ColumnHeader />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {perNote.map((note, i) => (
                <Table.Row key={`${note.target_name}-${i}`} bg="transparent">
                  <Table.Cell>{note.target_name}</Table.Cell>
                  <Table.Cell>
                    {note.cents_off === null
                      ? "(not detected)"
                      : note.cents_off.toFixed(1)}
                  </Table.Cell>
                  <Table.Cell>
                    {note.cents_off === null
                      ? "–"
                      : Math.abs(note.cents_off) <= 25
                        ? "✓"
                        : note.cents_off < 0
                          ? "♭ flat"
                          : "♯ sharp"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}
