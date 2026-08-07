import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import coaching from "@/prompts/coaching.json";
import {
  coachingModelOutputSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import { DRILL_IDS, STATE_IDS, renderCatalogue, resolveCoaching } from "@/lib/pedagogy";
import { OpenRouterError, callOpenRouter } from "@/lib/openrouter";
import { authenticateRequest } from "@/lib/serverAuth";
import { z } from "zod";

export const maxDuration = 120;

/** Below this many prior sessions the coach reports what it measured but does
 * not name a chronic problem. Scoring a stranger against universal thresholds
 * and calling the result a diagnosis is how a first session invents a problem
 * out of noise. */
const CALIBRATION_SESSIONS = 3;

// Open-weight reasoning models routed through require_parameters providers can
// take well over 25s, and two 50s attempts used to consume nearly the whole
// function budget before failing - so a model that simply needed 60s could
// never succeed, however many times it was retried. The first attempt now gets
// a slice long enough to finish, and the retry gets whatever is left.
//
// These must add up to less than maxDuration with room for auth, the Supabase
// round trip and the response.
const ROUTE_BUDGET_MS = 105_000;
const FIRST_ATTEMPT_MS = 70_000;
const MIN_ATTEMPT_MS = 20_000;

const requestSchema = z.object({
  exercise_spec: exerciseSpecSchema.nullable(),
  measurements: measurementsSchema,
  history: z.array(
    z.object({
      ts: z.string().nullable(),
      exercise_type: z.string().nullable(),
      measurements: z.record(z.string(), z.unknown()).nullable(),
      advice_given: z
        .object({
          focus_area: z.string(),
          top_issue: z.string(),
          drill: z.string(),
          state_id: z.string().optional(),
          drill_id: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

type CoachRequest = z.infer<typeof requestSchema>;

/** How many sessions this singer has actually recorded.
 *
 * Counted here rather than taken from the request: history is client-supplied,
 * so a fabricated block would talk the coach out of calibrating during the very
 * sessions the calibration exists to protect. Row-level security scopes the
 * count to the caller, so their own token is enough to ask.
 *
 * A failed count returns null and the caller keeps calibrating - erring toward
 * "still learning you" is the safe direction when the truth is unavailable. */
async function countSessions(token: string): Promise<number | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { count, error } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

/** Mirrors coach.py's _format_user_message: exercise, measurements
 * (nulls stripped, as model_dump_json(exclude_none=True) did), history,
 * pedagogy catalogue, task. */
function formatUserMessage(body: CoachRequest, calibrating: boolean): string {
  const blocks: string[] = [];
  if (body.exercise_spec !== null) {
    blocks.push(
      `<exercise>\n${JSON.stringify(body.exercise_spec, null, 2)}\n</exercise>`,
    );
  }
  blocks.push(
    `<measurements>\n${JSON.stringify(stripNulls(body.measurements), null, 2)}\n</measurements>`,
  );
  blocks.push(`<history>\n${JSON.stringify(body.history, null, 2)}\n</history>`);
  blocks.push(`<pedagogy>\n${renderCatalogue()}\n</pedagogy>`);
  blocks.push(
    "<task>Coach me. Lead with the most important thing to work on. " +
      "Specific, actionable. Follow up on your prior advice if history shows any. " +
      "Choose a state_id and a drill_id from the pedagogy block." +
      (calibrating
        ? " calibrating: true - this singer does not have enough history for a" +
          " baseline yet, so describe what you measured without diagnosing a" +
          " chronic problem, and say you are still learning their normal range."
        : "") +
      "</task>",
  );
  return blocks.join("\n\n");
}

/** The strict schema sent to OpenRouter, with the closed sets injected from
 * prompts/pedagogy.json. Keeping the enums out of coaching.json means the asset
 * stays the single source of truth for which states and drills exist - adding a
 * drill needs one edit, not two that can drift apart.
 *
 * additionalProperties is left to lib/openrouter.ts, which owns the request. */
function buildResponseSchema() {
  const properties = {
    ...coaching.schema.properties,
    state_id: { ...coaching.schema.properties.state_id, enum: STATE_IDS },
    drill_id: { ...coaching.schema.properties.drill_id, enum: DRILL_IDS },
  };
  return { ...coaching.schema, properties };
}

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY || !process.env.COACH_MODEL) {
    return NextResponse.json(
      { error: "coaching is not configured on the server" },
      { status: 500 },
    );
  }
  const token = await authenticateRequest(request);
  if (token === null) {
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });
  }

  let body: CoachRequest;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  // The session being coached is already in the table by the time this route
  // runs, so the count includes it: <= 3 keeps the first three sessions in
  // calibration and releases the fourth, matching what the client-supplied
  // history length used to produce.
  const sessionsOnFile = await countSessions(token);
  const calibrating = sessionsOnFile === null || sessionsOnFile <= CALIBRATION_SESSIONS;
  const userMessage = formatUserMessage(body, calibrating);
  const deadline = Date.now() + ROUTE_BUDGET_MS;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const raw = await callOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: process.env.COACH_MODEL!,
        systemPrompt: coaching.system_prompt,
        schema: buildResponseSchema(),
        userMessage,
        timeoutMs: Math.min(attempt === 0 ? FIRST_ATTEMPT_MS : remaining, remaining),
      });
      const result = coachingModelOutputSchema.safeParse(raw);
      if (result.success) {
        const resolved = resolveCoaching(
          result.data.state_id,
          result.data.drill_id,
          body.measurements,
        );
        if (resolved.used_fallback) {
          console.warn(
            `coach: unresolved ids state_id=${result.data.state_id} ` +
              `drill_id=${result.data.drill_id}; fell back to ${resolved.state.id}`,
          );
        }
        return NextResponse.json({
          ...result.data,
          state_id: resolved.state.id,
          drill_id: resolved.drill.id,
          calibrating,
          resolved: {
            state_id: resolved.state.id,
            state_name: resolved.state.display_name,
            remediation_family: resolved.state.remediation_family,
            audible_correction: resolved.state.audible_correction,
            drill: resolved.drill,
            cues: resolved.state.cues,
            caution: resolved.state.caution,
            used_fallback: resolved.used_fallback,
          },
        });
      }
      lastError = "model returned a malformed coaching result";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      if (error instanceof OpenRouterError && !error.retryable) break;
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
