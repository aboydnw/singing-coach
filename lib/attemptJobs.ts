import { z } from "zod";
import type { ExerciseThread } from "@/lib/exerciseThreads";
import { recordedExerciseIdForAttempt } from "@/lib/exerciseThreads";
import type { LearningContract } from "@/lib/schema";

export const attemptJobStatusSchema = z.enum([
  "queued",
  "analyzing",
  "coaching",
  "completed",
  "failed",
]);

export type AttemptJobStatus = z.infer<typeof attemptJobStatusSchema>;

export type AttemptJobRow = {
  id: string;
  user_id: string;
  practice_session_id: string;
  audio_key: string;
  status: AttemptJobStatus;
  exercise_spec_json: string | null;
  proposal_metadata_json: string | null;
  parent_attempt_id: string | null;
  attempt_kind: "initial" | "retry";
  attempt_id: string | null;
  measurements_json: string | null;
  contour_json: string | null;
  workflow_run_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const ACTIVE_STATUSES = new Set<AttemptJobStatus>([
  "queued",
  "analyzing",
  "coaching",
]);

export function activeAttemptJob(jobs: AttemptJobRow[]): AttemptJobRow | null {
  return (
    jobs
      .filter((job) => ACTIVE_STATUSES.has(job.status))
      .toSorted((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
  );
}

export function jobExerciseId(
  job: AttemptJobRow,
  threads: ExerciseThread[],
): string | null {
  if (job.parent_attempt_id) {
    return recordedExerciseIdForAttempt(threads, job.parent_attempt_id);
  }
  if (job.attempt_id) {
    return recordedExerciseIdForAttempt(threads, job.attempt_id);
  }
  return `job-${job.id}`;
}

export function pendingGuidance(
  job: AttemptJobRow,
  contract: LearningContract | null,
): string {
  const cue = cleanGuidance(contract?.tryCue);
  const spec = parseObject(job.exercise_spec_json);
  const proposal = parseObject(job.proposal_metadata_json);
  const guidance =
    cue ||
    cleanGuidance(typeof spec?.instructions === "string" ? spec.instructions : null) ||
    cleanGuidance(typeof proposal?.reason === "string" ? proposal.reason : null) ||
    "Take one easy breath and picture the first note before singing it.";
  return `${guidance} Don’t record another attempt yet.`;
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanGuidance(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}
