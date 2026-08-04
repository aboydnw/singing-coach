"use client";

import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { SessionRow } from "@/lib/sessions";

/** The six panels from PROGRESS_PANELS: same metrics, same healthy bands,
 * gaps (not interpolation) where a session lacks a metric. */
const PANELS: {
  key: string;
  title: string;
  ylabel: string;
  healthy: [number, number | null];
}[] = [
  { key: "cents_off", title: "Pitch accuracy", ylabel: "cents off (avg)", healthy: [0, 25] },
  { key: "jitter_local", title: "Pitch steadiness (jitter)", ylabel: "fraction", healthy: [0, 0.01] },
  { key: "shimmer_local", title: "Volume steadiness (shimmer)", ylabel: "fraction", healthy: [0, 0.05] },
  { key: "hnr_mean", title: "Tone clarity (HNR)", ylabel: "dB", healthy: [20, null] },
  { key: "vibrato_rate_hz", title: "Vibrato rate", ylabel: "Hz", healthy: [5.0, 6.5] },
  { key: "vibrato_extent_cents", title: "Vibrato depth", ylabel: "cents", healthy: [50, 100] },
];

function metricOf(row: SessionRow, key: string): number | null {
  let measurements: Record<string, unknown>;
  try {
    measurements = JSON.parse(row.measurements_json);
  } catch {
    return null;
  }
  if (key === "cents_off") {
    const accuracy = measurements.accuracy as {
      mean_abs_cents_off?: number | null;
    } | null;
    return accuracy?.mean_abs_cents_off ?? null;
  }
  const value = measurements[key];
  return typeof value === "number" ? value : null;
}

export function ProgressCharts({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return <Text color="cream.600">No sessions yet — go sing something!</Text>;
  }
  const chronological = [...sessions].reverse();

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
      {PANELS.map((panel) => {
        const data = chronological.map((row, i) => ({
          i,
          value: metricOf(row, panel.key),
        }));
        const values = data
          .map((d) => d.value)
          .filter((v): v is number => v !== null);
        const hasData = values.length > 0;
        const yMax = hasData
          ? Math.max(...values, panel.healthy[1] ?? panel.healthy[0])
          : (panel.healthy[1] ?? panel.healthy[0]);
        const bandTop = panel.healthy[1] ?? yMax * 1.2;

        return (
          <Box
            key={panel.key}
            bg="panel"
            borderWidth="1px"
            borderColor="grid"
            rounded="md"
            p={3}
          >
            <Text fontWeight="medium" fontSize="sm" color="ink.900" mb={1}>
              {panel.title}
            </Text>
            {hasData ? (
              <Box h="40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid stroke="#EADFCE" />
                    <XAxis dataKey="i" tick={false} label={undefined} stroke="#8A7566" />
                    <YAxis
                      stroke="#8A7566"
                      width={44}
                      label={{
                        value: panel.ylabel,
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 10,
                        fill: "#8A7566",
                      }}
                    />
                    <ReferenceArea
                      y1={panel.healthy[0]}
                      y2={bandTop}
                      fill="#4C9A70"
                      fillOpacity={0.12}
                    />
                    <Line
                      dataKey="value"
                      stroke="#D64B2A"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Text color="cream.600" fontSize="sm" py={8} textAlign="center">
                no data yet
              </Text>
            )}
          </Box>
        );
      })}
    </SimpleGrid>
  );
}
