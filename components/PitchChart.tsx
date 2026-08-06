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
import type { Ghost } from "@/lib/sessions";
import type { Contour, ExerciseSpec } from "@/lib/schema";

/** The sung contour against the exercise's target notes — the replacement for
 * the matplotlib pitch plot. Low-confidence frames become gaps, not lines.
 *
 * With a ghost, the singer's own best previous take of the same drill is drawn
 * underneath. That comparison is the honest one: acoustic thresholds do not
 * transfer between singers, but a singer's own past take always does. */
export function PitchChart({
  contour,
  spec,
  ghost,
}: {
  contour: Contour;
  spec: ExerciseSpec | null;
  ghost?: Ghost | null;
}) {
  const data = contour.times.map((t, i) => ({
    t,
    midi: contour.confidence[i] >= 0.5 ? contour.f0_midi[i] : null,
    ghost: null as number | null,
  }));

  // The ghost was recorded separately, so its frames do not line up with this
  // take's. Both are resampled onto a shared 0-1 position through the phrase,
  // which is the same proportional mapping accuracy.py uses to score notes.
  if (ghost && ghost.contour.times.length > 0 && data.length > 0) {
    const gt = ghost.contour.times;
    const gSpan = gt[gt.length - 1] - gt[0];
    const span = contour.times[contour.times.length - 1] - contour.times[0];
    if (gSpan > 0 && span > 0) {
      for (let i = 0; i < data.length; i++) {
        const position = (data[i].t - contour.times[0]) / span;
        const target = gt[0] + position * gSpan;
        const idx = nearestIndex(gt, target);
        data[i].ghost =
          ghost.contour.confidence[idx] >= 0.5 ? ghost.contour.f0_midi[idx] : null;
      }
    }
  }

  const targets = spec ? [...new Set(spec.target_notes_midi)] : [];
  const sung = data.map((d) => d.midi).filter((v): v is number => v !== null);
  if (sung.length === 0) {
    return <Text color="cream.600">No confident pitch detected in this recording.</Text>;
  }
  const ghostSung = data.map((d) => d.ghost).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...sung, ...ghostSung, ...targets)) - 2;
  const hi = Math.ceil(Math.max(...sung, ...ghostSung, ...targets)) + 2;

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
          {ghost && (
            <Line
              dataKey="ghost"
              stroke="#8A7566"
              strokeWidth={2}
              strokeOpacity={0.45}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
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

function nearestIndex(times: number[], target: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - target) < Math.abs(times[lo] - target)) {
    return lo - 1;
  }
  return lo;
}
