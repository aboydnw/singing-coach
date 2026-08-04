import { NextResponse } from "next/server";
import coaching from "@/prompts/coaching.json";
import {
  coachingResultSchema,
  exerciseSpecSchema,
  measurementsSchema,
} from "@/lib/schema";
import { z } from "zod";

export const maxDuration = 60;

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

async function callOpenRouter(userMessage: string): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
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
    throw new Error(`OpenRouter returned ${response.status}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter response had no message content");
  }
  return JSON.parse(content);
}

export async function POST(request: Request) {
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
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
