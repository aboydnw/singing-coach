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
  top_issue: z.string(),
  why: z.string(),
  drill: z.string(),
  encouragement: z.string(),
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

export type FocusArea = z.infer<typeof focusAreaSchema>;
export type ExerciseSpec = z.infer<typeof exerciseSpecSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
export type CoachingResult = z.infer<typeof coachingResultSchema>;
export type Calibration = z.infer<typeof calibrationSchema>;
export type Contour = z.infer<typeof contourSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
