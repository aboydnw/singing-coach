import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { attemptJobRequestSchema, ownsAudioKey } from "@/lib/attemptJobRequest";
import type { AttemptJobRow } from "@/lib/attemptJobs";
import { authenticateRequest } from "@/lib/serverAuth";
import { serviceSupabase } from "@/lib/serverSupabase";
import { processPracticeAttempt } from "@/workflows/processPracticeAttempt";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });

  const parsed = attemptJobRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  if (!ownsAudioKey(parsed.data.audio_key, auth.userId)) {
    return NextResponse.json({ error: "storage key not owned by caller" }, { status: 403 });
  }

  const caller = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${auth.token}` } } },
  );
  const { data: practice, error: practiceError } = await caller
    .from("practice_sessions")
    .select("id,status")
    .eq("id", parsed.data.practice_session_id)
    .maybeSingle();
  if (practiceError || !practice) return NextResponse.json({ error: "practice not found" }, { status: 404 });
  if (practice.status !== "in_progress") return NextResponse.json({ error: "practice has ended" }, { status: 409 });

  if (parsed.data.parent_attempt_id) {
    const { data: parent } = await caller
      .from("sessions")
      .select("id")
      .eq("id", parsed.data.parent_attempt_id)
      .eq("practice_session_id", practice.id)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "parent attempt not found" }, { status: 400 });
  }

  const service = serviceSupabase();
  const jobId = crypto.randomUUID();
  const { data: job, error: insertError } = await service
    .from("practice_attempt_jobs")
    .insert({
      id: jobId,
      user_id: auth.userId,
      practice_session_id: practice.id,
      audio_key: parsed.data.audio_key,
      status: "queued",
      exercise_spec_json: parsed.data.exercise_spec ? JSON.stringify(parsed.data.exercise_spec) : null,
      proposal_metadata_json: JSON.stringify(parsed.data.proposal_metadata),
      parent_attempt_id: parsed.data.parent_attempt_id,
      attempt_kind: parsed.data.attempt_kind,
    })
    .select("*")
    .single();
  if (insertError) {
    const duplicate = insertError.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "an attempt is already processing" : insertError.message },
      { status: duplicate ? 409 : 500 },
    );
  }

  try {
    const run = await start(processPracticeAttempt, [jobId]);
    const { data: updated, error: runError } = await service
      .from("practice_attempt_jobs")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .select("*")
      .single();
    if (runError) throw new Error(runError.message);
    return NextResponse.json(updated as AttemptJobRow, { status: 202 });
  } catch {
    await service
      .from("practice_attempt_jobs")
      .update({
        status: "failed",
        error_code: "workflow_start_failed",
        error_message: "We could not start processing yet. Try handing off again.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "queued");
    return NextResponse.json({ error: "could not start attempt processing", job_id: jobId }, { status: 503 });
  }
}
