import { z } from "zod";
import coaching from "@/prompts/coaching.json";

export const FOCUS_AREAS = coaching.schema.properties.focus_area.enum as [
  string,
  ...string[],
];

export const focusAreaSchema = z.enum(FOCUS_AREAS);

export const exerciseSpecSchema = z.object({
  type: z.enum(["sustained", "scale", "arpeggio", "siren"]),
  target_notes_midi: z.array(z.number().int()),
  duration_per_note_s: z.number(),
  vowel: z.string(),
  display_name: z.string(),
});

export const noteAccuracySchema = z.object({
  target_midi: z.number().int(),
  target_name: z.string(),
  cents_off: z.number().nullable(),
});

export const pitchAccuracySchema = z.object({
  per_note: z.array(noteAccuracySchema),
  mean_abs_cents_off: z.number().nullable(),
});

export const measurementsSchema = z.object({
  jitter_local: z.number().nullable().default(null),
  shimmer_local: z.number().nullable().default(null),
  hnr_mean: z.number().nullable().default(null),
  vibrato_rate_hz: z.number().nullable().default(null),
  vibrato_extent_cents: z.number().nullable().default(null),
  f1_mean: z.number().nullable().default(null),
  f2_mean: z.number().nullable().default(null),
  accuracy: pitchAccuracySchema.nullable().default(null),
});

export const coachingResultSchema = z.object({
  focus_area: focusAreaSchema,
  state_id: z.string(),
  drill_id: z.string(),
  top_issue: z.string(),
  why: z.string(),
  drill: z.string(),
  encouragement: z.string(),
});

/** What the model is allowed to hand back.
 *
 * The ids are optional here and required in coachingResultSchema on purpose.
 * The request asks for both under a strict schema, but a provider that ignores
 * strict mode and omits one should land in the deterministic fallback - which
 * exists for exactly this - rather than failing validation and costing the
 * singer their coaching. The route fills both in from the resolved state, so
 * the response the client sees still always carries them. */
export const coachingModelOutputSchema = coachingResultSchema.partial({
  state_id: true,
  drill_id: true,
});

export const drillSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  duration_s: z.number(),
  exercise_type: z.string().nullable().optional(),
});

/** What the singer is shown alongside the model's prose: the canonical drill
 * and cues, resolved server-side from prompts/pedagogy.json rather than
 * generated. */
export const resolvedCoachingSchema = z.object({
  state_id: z.string(),
  state_name: z.string(),
  remediation_family: z.string(),
  audible_correction: z.string().nullable(),
  drill: drillSchema,
  cues: z.array(z.string()),
  caution: z.string().nullable(),
  used_fallback: z.boolean(),
});

export const coachingResponseSchema = coachingResultSchema.extend({
  resolved: resolvedCoachingSchema,
  calibrating: z.boolean().default(false),
});

export const calibrationSchema = z.object({
  range_low_midi: z.number().int(),
  range_high_midi: z.number().int(),
  tessitura_low_midi: z.number().int().nullable(),
  tessitura_high_midi: z.number().int().nullable(),
});

export const contourSchema = z.object({
  times: z.array(z.number()),
  f0_midi: z.array(z.number().nullable()),
  confidence: z.array(z.number()),
});

export const analyzeResponseSchema = z.object({
  measurements: measurementsSchema.nullable(),
  pitch_median_midi: z.number().nullable(),
  contour: contourSchema,
});

export const startingDirectionSchema = z.enum([
  "coach_pick",
  "pitch",
  "steadiness",
  "tone",
  "free_sing",
]);

export const learningContractSchema = z.object({
  focusArea: focusAreaSchema.nullable(),
  focus: z.string(),
  listenFor: z.string(),
  tryCue: z.string(),
  avoid: z.string().nullable(),
  strength: z.string().nullable(),
  readyWhen: z.string(),
  updatedAfterAttemptId: z.string().nullable(),
  confidence: z.enum(["early", "developing", "supported"]),
});

export const contextAnchorSchema = z.object({
  kind: z.enum(["coaching_text", "exercise_instruction", "measurement", "compass_field"]),
  sourceId: z.string(),
  label: z.string(),
  value: z.string(),
});

export type FocusArea = z.infer<typeof focusAreaSchema>;
export type ExerciseSpec = z.infer<typeof exerciseSpecSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
export type CoachingResult = z.infer<typeof coachingResultSchema>;
export type ResolvedCoachingPayload = z.infer<typeof resolvedCoachingSchema>;
export type CoachingResponse = z.infer<typeof coachingResponseSchema>;
export type Calibration = z.infer<typeof calibrationSchema>;
export type Contour = z.infer<typeof contourSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
export type StartingDirection = z.infer<typeof startingDirectionSchema>;
export type LearningContract = z.infer<typeof learningContractSchema>;
export type ContextAnchor = z.infer<typeof contextAnchorSchema>;
