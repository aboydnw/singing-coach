/** Supabase reads/writes for calibration and session history. Column shapes
 * match the existing schema: *_json columns are text holding stringified JSON,
 * ids are client-generated UUIDs. */

import type { HistoryEntry } from "@/lib/api";
import type {
  Calibration,
  CoachingResult,
  ExerciseSpec,
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
};

export function coachingToMarkdown(coaching: CoachingResult): string {
  return (
    `### 🎯 ${coaching.top_issue}\n\n` +
    `${coaching.why}\n\n` +
    `**Try this:** ${coaching.drill}\n\n` +
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
  coaching: CoachingResult | null;
  audioKey: string;
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
    });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateSessionCoaching(
  sessionId: string,
  coaching: CoachingResult,
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
      "id, ts, exercise_type, exercise_spec_json, measurements_json, coaching_md, coaching_json, audio_key",
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
    }
    return entry;
  });
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
