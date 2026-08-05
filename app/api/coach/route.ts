import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import coaching from "@/prompts/coaching.json";
import {
  coachingResultSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import { z } from "zod";

export const maxDuration = 120;

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
 * (nulls stripped, as model_dump_json(exclude_none=True) did), history, task. */
function formatUserMessage(body: CoachRequest): string {
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
  blocks.push(
    "<task>Coach me. Lead with the most important thing to work on. " +
      "Specific, actionable. Follow up on your prior advice if history shows any.</task>",
  );
  return blocks.join("\n\n");
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

/** OpenRouter reports failures as {"error": {"code", "message"}}, but a bare
 * string or an HTML error page both happen too. Falls back to the raw body,
 * capped so a stray error page cannot become the UI's error message. */
function describeError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // not JSON; fall through to the raw body
  }
  return body.slice(0, 200);
}

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
          schema: { ...coaching.schema, additionalProperties: false },
        },
      },
      provider: { require_parameters: true },
    }),
  });
  if (!response.ok) {
    const detail = describeError(await response.text().catch(() => ""));
    throw new OpenRouterError(
      `OpenRouter returned ${response.status}${detail ? `: ${detail}` : ""}`,
      RETRYABLE_STATUSES.has(response.status),
    );
  }
  const payload = await response.json();
  // An upstream provider failure arrives as HTTP 200 with an error body.
  if (payload?.error) {
    throw new OpenRouterError(
      `OpenRouter reported: ${describeError(JSON.stringify(payload))}`,
      true,
    );
  }
  const content = payload.choices?.[0]?.message?.content;
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

  const userMessage = formatUserMessage(body);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callOpenRouter(userMessage);
      const result = coachingResultSchema.safeParse(raw);
      if (result.success) {
        return NextResponse.json(result.data);
      }
      lastError = "model returned a malformed coaching result";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      if (error instanceof OpenRouterError && !error.retryable) break;
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
