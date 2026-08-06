import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import coaching from "@/prompts/coaching.json";
import {
  coachingResultSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import { DRILL_IDS, STATE_IDS, renderCatalogue, resolveCoaching } from "@/lib/pedagogy";
import { z } from "zod";

export const maxDuration = 120;

/** Below this many prior sessions the coach reports what it measured but does
 * not name a chronic problem. Scoring a stranger against universal thresholds
 * and calling the result a diagnosis is how a first session invents a problem
 * out of noise. */
const CALIBRATION_SESSIONS = 3;

// Open-weight reasoning models routed through require_parameters providers
// can take well over 25s; a timeout here surfaces as a dead coaching step.
const OPENROUTER_TIMEOUT_MS = 50_000;

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

/** The route spends OPENROUTER_API_KEY, so only signed-in users may call it. */
async function authenticate(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(header.slice("Bearer ".length));
  return !error && data.user !== null;
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
 * drill needs one edit, not two that can drift apart. */
function buildResponseSchema() {
  const properties = {
    ...coaching.schema.properties,
    state_id: { ...coaching.schema.properties.state_id, enum: STATE_IDS },
    drill_id: { ...coaching.schema.properties.drill_id, enum: DRILL_IDS },
  };
  return { ...coaching.schema, properties, additionalProperties: false };
}

/** An OpenRouter failure that knows whether trying again could help. Credit,
 * key and model-capability problems are settled facts, so retrying them only
 * doubles the wait before the singer sees why coaching failed. */
class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

const MAX_ERROR_TEXT = 200;

/** Capping every message on the way into an OpenRouterError, rather than at
 * each source, is what keeps a stray HTML error page or a verbose provider
 * message out of the UI: the status prefix leads, so it always survives. */
function truncate(text: string): string {
  return text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}…` : text;
}

/** OpenRouter reports failures as {"error": {"code", "message"}}, but a bare
 * string or an HTML error page both happen too, hence the raw-body fallback. */
function describeError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // not JSON; fall through to the raw body
  }
  return body;
}

type OpenRouterPayload = {
  error?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
};

async function callOpenRouter(userMessage: string): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Singing Coach",
    },
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.COACH_MODEL,
      messages: [
        { role: "system", content: coaching.system_prompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "give_coaching",
          strict: true,
          schema: buildResponseSchema(),
        },
      },
      provider: { require_parameters: true },
    }),
  });
  if (!response.ok) {
    const detail = describeError(await response.text().catch(() => ""));
    throw new OpenRouterError(
      truncate(`OpenRouter returned ${response.status}${detail ? `: ${detail}` : ""}`),
      RETRYABLE_STATUSES.has(response.status),
    );
  }

  // A gateway between here and the model can answer 200 with an HTML error
  // page. Parsing that raises a SyntaxError whose message says nothing useful
  // about what actually failed, so it becomes an OpenRouterError instead.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OpenRouterError("OpenRouter returned a body that was not JSON", true);
  }
  if (payload === null || typeof payload !== "object") {
    throw new OpenRouterError("OpenRouter returned an unexpected body", true);
  }

  const body = payload as OpenRouterPayload;
  // An upstream provider failure arrives as HTTP 200 with an error field.
  if (body.error) {
    throw new OpenRouterError(
      truncate(`OpenRouter reported: ${describeError(JSON.stringify(body))}`),
      true,
    );
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new OpenRouterError("OpenRouter response had no message content", true);
  }
  return JSON.parse(content);
}

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY || !process.env.COACH_MODEL) {
    return NextResponse.json(
      { error: "coaching is not configured on the server" },
      { status: 500 },
    );
  }
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });
  }

  let body: CoachRequest;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const calibrating = body.history.length < CALIBRATION_SESSIONS;
  const userMessage = formatUserMessage(body, calibrating);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callOpenRouter(userMessage);
      const result = coachingResultSchema.safeParse(raw);
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
