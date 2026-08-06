import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import coaching from "@/prompts/coaching.json";
import {
  coachingResultSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import { OpenRouterError, callOpenRouter } from "@/lib/openrouter";
import { z } from "zod";

export const maxDuration = 120;

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
        schema: coaching.schema,
        userMessage,
        timeoutMs: Math.min(attempt === 0 ? FIRST_ATTEMPT_MS : remaining, remaining),
      });
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
