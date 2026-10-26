import { z } from "zod";
import { exerciseSpecSchema, proposalMetadataSchema } from "@/lib/schema";

export const attemptJobRequestSchema = z.object({
  practice_session_id: z.string().uuid(),
  audio_key: z.string().min(1),
  exercise_spec: exerciseSpecSchema.nullable(),
  proposal_metadata: proposalMetadataSchema,
  parent_attempt_id: z.string().uuid().nullable(),
  attempt_kind: z.enum(["initial", "retry"]),
});

export type AttemptJobRequest = z.infer<typeof attemptJobRequestSchema>;

export function ownsAudioKey(audioKey: string, userId: string): boolean {
  const parts = audioKey.split("/");
  return (
    parts.length === 2 && parts[0] === userId && /^[A-Za-z0-9_-]+\.wav$/.test(parts[1])
  );
}
