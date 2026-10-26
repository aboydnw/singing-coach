import { z } from "zod";
import coaching from "@/prompts/coaching.json";
import {
  coachingModelOutputSchema,
  exerciseSpecSchema,
  measurementsSchema,
  type CoachingResponse,
} from "@/lib/schema";
import { DRILL_IDS, STATE_IDS, renderCatalogue, resolveCoaching } from "@/lib/pedagogy";
import { OpenRouterError, callOpenRouter } from "@/lib/openrouter";

const CALIBRATION_SESSIONS = 3;
const ROUTE_BUDGET_MS = 105_000;
const FIRST_ATTEMPT_MS = 70_000;
const MIN_ATTEMPT_MS = 20_000;

export const coachRequestSchema = z.object({
  exercise_spec: exerciseSpecSchema.nullable(),
  measurements: measurementsSchema,
  current_practice_session_id: z.string().uuid().nullable().default(null),
  history: z.array(
    z.object({
      ts: z.string().nullable(),
      practice_session_id: z.string().uuid().nullable(),
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

export type CoachRequest = z.infer<typeof coachRequestSchema>;

export function isCalibratingSinger(sessionCount: number | null): boolean {
  return sessionCount === null || sessionCount <= CALIBRATION_SESSIONS;
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null && entry !== undefined)
        .map(([key, entry]) => [key, stripNulls(entry)]),
    );
  }
  return value;
}

export function formatCoachUserMessage(body: CoachRequest, calibrating: boolean): string {
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
      "Choose a state_id and a drill_id from the pedagogy block. " +
      `The current practice session id is ${body.current_practice_session_id ?? "not available"}; ` +
      "use it to separate this session from the longer-term trend." +
      (calibrating
        ? " calibrating: true - this singer does not have enough history for a" +
          " baseline yet, so describe what you measured without diagnosing a" +
          " chronic problem, and say you are still learning their normal range."
        : "") +
      "</task>",
  );
  return blocks.join("\n\n");
}

function responseSchema() {
  return {
    ...coaching.schema,
    properties: {
      ...coaching.schema.properties,
      state_id: { ...coaching.schema.properties.state_id, enum: STATE_IDS },
      drill_id: { ...coaching.schema.properties.drill_id, enum: DRILL_IDS },
    },
  };
}

export async function generateCoaching(
  body: CoachRequest,
  sessionCount: number | null,
): Promise<CoachingResponse> {
  if (!process.env.OPENROUTER_API_KEY || !process.env.COACH_MODEL) {
    throw new Error("coaching is not configured on the server");
  }
  const calibrating = isCalibratingSinger(sessionCount);
  const userMessage = formatCoachUserMessage(body, calibrating);
  const deadline = Date.now() + ROUTE_BUDGET_MS;
  let lastError = "coaching failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const raw = await callOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.COACH_MODEL,
        systemPrompt: coaching.system_prompt,
        schema: responseSchema(),
        userMessage,
        timeoutMs: Math.min(attempt === 0 ? FIRST_ATTEMPT_MS : remaining, remaining),
      });
      const result = coachingModelOutputSchema.safeParse(raw);
      if (!result.success) {
        lastError = "model returned a malformed coaching result";
        continue;
      }
      const resolved = resolveCoaching(
        result.data.state_id,
        result.data.drill_id,
        body.measurements,
      );
      return {
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
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      if (error instanceof OpenRouterError && !error.retryable) break;
    }
  }
  throw new Error(lastError);
}
