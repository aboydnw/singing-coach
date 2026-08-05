"use client";

import { Box, Text } from "@chakra-ui/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { midiToName } from "@/lib/exercises";
import type { Contour, ExerciseSpec } from "@/lib/schema";

/** The sung contour against the exercise's target notes — the replacement for
 * the matplotlib pitch plot. Low-confidence frames become gaps, not lines. */
export function PitchChart({
  contour,
  spec,
}: {
  contour: Contour;
  spec: ExerciseSpec | null;
}) {
  const data = contour.times.map((t, i) => ({
    t,
    midi: contour.confidence[i] >= 0.5 ? contour.f0_midi[i] : null,
  }));

  const targets = spec ? [...new Set(spec.target_notes_midi)] : [];
  const sung = data.map((d) => d.midi).filter((v): v is number => v !== null);
  if (sung.length === 0) {
    return <Text color="cream.600">No confident pitch detected in this recording.</Text>;
  }
  const lo = Math.floor(Math.min(...sung, ...targets)) - 2;
  const hi = Math.ceil(Math.max(...sung, ...targets)) + 2;

  return (
    <Box h="64" bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={2}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#EADFCE" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => `${v.toFixed(0)}s`}
            stroke="#8A7566"
          />
          <YAxis
            domain={[lo, hi]}
            tickFormatter={(v: number) => midiToName(Math.round(v))}
            stroke="#8A7566"
            width={44}
          />
          {targets.map((midi) => (
            <ReferenceLine
              key={midi}
              y={midi}
              stroke="#00917C"
              strokeDasharray="4 4"
              label={{ value: midiToName(midi), fill: "#00917C", fontSize: 11 }}
            />
          ))}
          <Line
            dataKey="midi"
            stroke="#D64B2A"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
