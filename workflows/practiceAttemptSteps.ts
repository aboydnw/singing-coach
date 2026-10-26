import { analyzeResponseSchema, coachingResponseSchema, exerciseSpecSchema, learningContractSchema } from "@/lib/schema";
import type { AnalyzeResponse, CoachingResponse } from "@/lib/schema";
import type { AttemptJobRow } from "@/lib/attemptJobs";
import { serviceSupabase } from "@/lib/serverSupabase";
import { signJobAssertion } from "@/lib/jobAssertion";
import { generateCoaching } from "@/lib/coachService";
import { contractFromAttempt } from "@/lib/practice";
import { coachingToMarkdown, toHistory, type SessionRow } from "@/lib/sessions";

async function loadJob(jobId: string): Promise<AttemptJobRow> {
  const { data, error } = await serviceSupabase()
    .from("practice_attempt_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Attempt job not found.");
  return data as AttemptJobRow;
}

async function transition(
  jobId: string,
  from: AttemptJobRow["status"][],
  to: AttemptJobRow["status"],
) {
  const { data, error } = await serviceSupabase()
    .from("practice_attempt_jobs")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", from)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const current = await loadJob(jobId);
    if (current.status !== to && current.status !== "completed") {
      throw new Error(`Attempt job cannot move from ${current.status} to ${to}.`);
    }
  }
}

export async function claimAnalysis(jobId: string) {
  "use step";
  await transition(jobId, ["queued"], "analyzing");
}

export async function analyzeAttempt(jobId: string): Promise<AnalyzeResponse> {
  "use step";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const response = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Attempt-Job-Assertion": signJobAssertion(jobId),
    },
    body: "{}",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Analysis failed with status ${response.status}.`);
  }
  return analyzeResponseSchema.parse(await response.json());
}

export async function persistAnalysis(
  jobId: string,
  analysis: AnalyzeResponse,
): Promise<string> {
  "use step";
  if (!analysis.measurements) throw new Error("Analysis returned no measurements.");
  const service = serviceSupabase();
  const { error: checkpointError } = await service
    .from("practice_attempt_jobs")
    .update({
      measurements_json: JSON.stringify(analysis.measurements),
      contour_json: JSON.stringify(analysis.contour),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["analyzing", "coaching"]);
  if (checkpointError) throw new Error(checkpointError.message);
  const { data, error } = await service.rpc("create_attempt_from_job", {
    p_job_id: jobId,
  });
  if (error || typeof data !== "string") {
    throw new Error(error?.message ?? "Could not persist analyzed attempt.");
  }
  return data;
}

export async function claimCoaching(jobId: string) {
  "use step";
  await transition(jobId, ["analyzing"], "coaching");
}

export async function coachAttempt(
  jobId: string,
  attemptId: string,
): Promise<CoachingResponse> {
  "use step";
  const service = serviceSupabase();
  const job = await loadJob(jobId);
  const [{ data: attempts, error: attemptsError }, { count, error: countError }] =
    await Promise.all([
      service
        .from("sessions")
        .select("*")
        .eq("user_id", job.user_id)
        .neq("id", attemptId)
        .order("ts", { ascending: false })
        .limit(30),
      service
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", job.user_id),
    ]);
  if (attemptsError) throw new Error(attemptsError.message);
  const measurements = JSON.parse(job.measurements_json ?? "null");
  const exerciseSpec = job.exercise_spec_json
    ? exerciseSpecSchema.parse(JSON.parse(job.exercise_spec_json))
    : null;
  return generateCoaching(
    {
      exercise_spec: exerciseSpec,
      measurements,
      current_practice_session_id: job.practice_session_id,
      history: toHistory((attempts ?? []) as SessionRow[], 30),
    },
    countError ? null : count,
  );
}

export async function completeAttempt(
  jobId: string,
  attemptId: string,
  coaching: CoachingResponse,
) {
  "use step";
  const service = serviceSupabase();
  const { error: attemptError } = await service
    .from("sessions")
    .update({
      coaching_md: coachingToMarkdown(coaching),
      coaching_json: JSON.stringify(coachingResponseSchema.parse(coaching)),
    })
    .eq("id", attemptId);
  if (attemptError) throw new Error(attemptError.message);

  const [{ data: attempt, error: loadAttemptError }, { data: job, error: jobError }] =
    await Promise.all([
      service.from("sessions").select("*").eq("id", attemptId).single(),
      service.from("practice_attempt_jobs").select("*").eq("id", jobId).single(),
    ]);
  if (loadAttemptError || !attempt) throw new Error(loadAttemptError?.message ?? "Attempt missing.");
  if (jobError || !job) throw new Error(jobError?.message ?? "Attempt job missing.");
  const { data: practice, error: practiceError } = await service
    .from("practice_sessions")
    .select("learning_contract_json")
    .eq("id", job.practice_session_id)
    .single();
  if (practiceError || !practice) throw new Error(practiceError?.message ?? "Practice missing.");
  const prior = learningContractSchema.parse(practice.learning_contract_json);
  const next = contractFromAttempt(prior, attempt as SessionRow);
  const { error: contractError } = await service
    .from("practice_sessions")
    .update({ learning_contract_json: next, updated_at: new Date().toISOString() })
    .eq("id", job.practice_session_id)
    .eq("status", "in_progress");
  if (contractError) throw new Error(contractError.message);
  const now = new Date().toISOString();
  const { error: completionError } = await service
    .from("practice_attempt_jobs")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", jobId)
    .eq("attempt_id", attemptId);
  if (completionError) throw new Error(completionError.message);
}

export async function failAttempt(
  jobId: string,
  failure: { code: string; message: string },
) {
  "use step";
  const safeMessage = failure.message.slice(0, 240);
  const { error } = await serviceSupabase()
    .from("practice_attempt_jobs")
    .update({
      status: "failed",
      error_code: failure.code,
      error_message: safeMessage,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "analyzing", "coaching"]);
  if (error) throw new Error(error.message);
}
