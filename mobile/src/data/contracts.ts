import { z } from "zod";
import { learningContractSchema, startingDirectionSchema } from "@/lib/schema";
export const practiceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(["in_progress", "ended"]),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  starting_direction: startingDirectionSchema,
  learning_contract_json: learningContractSchema.nullable(),
  summary_json: z
    .object({
      attemptCount: z.number(),
      focus: z.string(),
      strength: z.string().nullable(),
      change: z.string().nullable(),
    })
    .nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const sessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  ts: z.string(),
  exercise_type: z.string(),
  exercise_spec_json: z.string().nullable(),
  proposal_metadata_json: z.string().nullable().optional(),
  measurements_json: z.string(),
  coaching_md: z.string(),
  coaching_json: z.string().nullable(),
  audio_key: z.string().nullable(),
  contour_json: z.string().nullable(),
  practice_session_id: z.string().uuid().nullable(),
  sequence_number: z.number().nullable(),
  parent_attempt_id: z.string().uuid().nullable(),
  attempt_kind: z.enum(["initial", "retry"]).nullable(),
});
export const jobSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  practice_session_id: z.string().uuid(),
  audio_key: z.string(),
  status: z.enum(["queued", "analyzing", "coaching", "completed", "failed", "abandoned"]),
  exercise_spec_json: z.string().nullable(),
  proposal_metadata_json: z.string().nullable(),
  parent_attempt_id: z.string().uuid().nullable(),
  attempt_kind: z.enum(["initial", "retry"]),
  attempt_id: z.string().uuid().nullable(),
  measurements_json: z.string().nullable(),
  contour_json: z.string().nullable(),
  workflow_run_id: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Practice = z.infer<typeof practiceSchema>;
export type Attempt = z.infer<typeof sessionSchema>;
export type Job = z.infer<typeof jobSchema>;
export type PracticeBundle = { practice: Practice; attempts: Attempt[]; jobs: Job[] };
