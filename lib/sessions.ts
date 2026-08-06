/** Supabase reads/writes for calibration and session history. Column shapes
 * match the existing schema: *_json columns are text holding stringified JSON,
 * ids are client-generated UUIDs. */

import type { HistoryEntry } from "@/lib/api";
import type {
  Calibration,
  CoachingResponse,
  CoachingResult,
  ExerciseSpec,
  Contour,
  Measurements,
} from "@/lib/schema";
import { supabase, userId } from "@/lib/supabase";

export type SessionRow = {
  id: string;
  ts: string;
  exercise_type: string;
  exercise_spec_json: string | null;
  measurements_json: string;
  coaching_md: string;
  coaching_json: string | null;
  audio_key: string | null;
  contour_json: string | null;
};

/** The overlay needs the shape of the note, not every frame, so contours are
 * thinned before storage. At full rate a ten-second take is ~1000 frames and
 * tens of kilobytes of JSON in every row. */
export const GHOST_CONTOUR_POINTS = 300;

export function decimateContour(contour: Contour): Contour {
  const n = contour.times.length;
  if (n <= GHOST_CONTOUR_POINTS) return contour;
  const step = n / GHOST_CONTOUR_POINTS;
  const times: number[] = [];
  const f0_midi: (number | null)[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < GHOST_CONTOUR_POINTS; i++) {
    const idx = Math.min(n - 1, Math.floor(i * step));
    times.push(contour.times[idx]);
    f0_midi.push(contour.f0_midi[idx]);
    confidence.push(contour.confidence[idx]);
  }
  return { times, f0_midi, confidence };
}

export function coachingToMarkdown(coaching: CoachingResult | CoachingResponse): string {
  const resolved = "resolved" in coaching ? coaching.resolved : null;
  const canonical = resolved
    ? `\n\n**${resolved.drill.name}** (${Math.round(resolved.drill.duration_s)}s)\n\n` +
      `${resolved.drill.instructions}\n\n` +
      resolved.cues.map((cue) => `- ${cue}`).join("\n")
    : "";
  return (
    `### 🎯 ${coaching.top_issue}\n\n` +
    `${coaching.why}\n\n` +
    `**Try this:** ${coaching.drill}${canonical}\n\n` +
    `_${coaching.encouragement}_`
  );
}

export async function saveCalibration(calibration: Calibration): Promise<void> {
  const uid = await userId();
  if (!uid) throw new Error("not signed in");
  const { error } = await supabase().from("calibration").insert({
    id: crypto.randomUUID(),
    user_id: uid,
    ts: new Date().toISOString(),
    range_low_midi: calibration.range_low_midi,
    range_high_midi: calibration.range_high_midi,
    tessitura_low_midi: calibration.tessitura_low_midi,
    tessitura_high_midi: calibration.tessitura_high_midi,
  });
  if (error) throw new Error(error.message);
}

export async function latestCalibration(): Promise<Calibration | null> {
  const { data, error } = await supabase()
    .from("calibration")
    .select("range_low_midi, range_high_midi, tessitura_low_midi, tessitura_high_midi")
    .order("ts", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function insertSession(args: {
  spec: ExerciseSpec | null;
  measurements: Measurements;
  coaching: CoachingResponse | null;
  audioKey: string;
  contour?: Contour | null;
}): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error("not signed in");
  const id = crypto.randomUUID();
  const { error } = await supabase()
    .from("sessions")
    .insert({
      id,
      user_id: uid,
      ts: new Date().toISOString(),
      exercise_type: args.spec?.type ?? "free_sing",
      exercise_spec_json: args.spec ? JSON.stringify(args.spec) : null,
      measurements_json: JSON.stringify(args.measurements),
      coaching_md: args.coaching ? coachingToMarkdown(args.coaching) : "",
      coaching_json: args.coaching ? JSON.stringify(args.coaching) : null,
      audio_key: args.audioKey,
      contour_json: args.contour ? JSON.stringify(decimateContour(args.contour)) : null,
    });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateSessionCoaching(
  sessionId: string,
  coaching: CoachingResponse,
): Promise<void> {
  const { error } = await supabase()
    .from("sessions")
    .update({
      coaching_md: coachingToMarkdown(coaching),
      coaching_json: JSON.stringify(coaching),
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase()
    .from("sessions")
    .select(
      "id, ts, exercise_type, exercise_spec_json, measurements_json, coaching_md, coaching_json, audio_key, contour_json",
    )
    .order("ts", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sessionCount(): Promise<number> {
  const { count, error } = await supabase()
    .from("sessions")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** History for the coach: newest first, capped, in the shape coach.py's
 * _history_payload produced. */
export function toHistory(rows: SessionRow[], limit = 5): HistoryEntry[] {
  return rows.slice(0, limit).map((row) => {
    const entry: HistoryEntry = {
      ts: row.ts,
      exercise_type: row.exercise_type,
      measurements: safeParse(row.measurements_json),
    };
    const coaching = safeParse(row.coaching_json);
    if (coaching) {
      entry.advice_given = {
        focus_area: String(coaching.focus_area),
        top_issue: String(coaching.top_issue),
        drill: String(coaching.drill),
      };
      // Carried so the coach can follow up on the drill it actually assigned
      // rather than on its own paraphrase of it.
      if (coaching.state_id) entry.advice_given.state_id = String(coaching.state_id);
      if (coaching.drill_id) entry.advice_given.drill_id = String(coaching.drill_id);
    }
    return entry;
  });
}

export type Ghost = {
  contour: Contour;
  ts: string;
  meanAbsCentsOff: number;
};

/** The singer's own best previous take of this exact drill, for the overlay.
 *
 * "Best" is the lowest mean absolute cents off, ties broken by the more recent
 * take. Matching on exercise type AND target notes matters: a scale starting on
 * C3 is not the same task as one starting on F3, and racing a ghost from a
 * different set of notes would be comparing two different things. */
export function bestPriorTake(
  rows: SessionRow[],
  spec: ExerciseSpec | null,
  excludeSessionId?: string,
): Ghost | null {
  if (!spec) return null;
  let best: Ghost | null = null;

  for (const row of rows) {
    if (row.id === excludeSessionId) continue;
    if (!row.contour_json) continue;
    if (row.exercise_type !== spec.type) continue;

    const rowSpec = safeParse(row.exercise_spec_json);
    const notes = rowSpec?.target_notes_midi;
    if (!Array.isArray(notes) || !sameNotes(notes, spec.target_notes_midi)) continue;

    const measurements = safeParse(row.measurements_json);
    const accuracy = measurements?.accuracy as { mean_abs_cents_off?: unknown } | null;
    const cents = accuracy?.mean_abs_cents_off;
    if (typeof cents !== "number") continue;

    const contour = safeParse(row.contour_json) as Contour | null;
    if (!contour || !Array.isArray(contour.times) || contour.times.length === 0) continue;

    if (best === null || cents < best.meanAbsCentsOff) {
      best = { contour, ts: row.ts, meanAbsCentsOff: cents };
    }
  }
  return best;
}

function sameNotes(a: unknown[], b: number[]): boolean {
  return a.length === b.length && a.every((note, i) => note === b[i]);
}

export function latestFocusArea(rows: SessionRow[]): string | null {
  for (const row of rows) {
    const coaching = safeParse(row.coaching_json);
    if (coaching?.focus_area) return String(coaching.focus_area);
  }
  return null;
}

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function signedAudioUrl(audioKey: string): Promise<string | null> {
  const { data, error } = await supabase()
    .storage.from("recordings")
    .createSignedUrl(audioKey, 3600);
  if (error) return null;
  return data.signedUrl;
}
