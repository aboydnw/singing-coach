import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { authenticateRequest } from "@/lib/serverAuth";
import { serviceSupabase } from "@/lib/serverSupabase";
import { processPracticeAttempt } from "@/workflows/processPracticeAttempt";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth)
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });
  const { id } = await context.params;
  const service = serviceSupabase();
  const { data: job, error } = await service
    .from("practice_attempt_jobs")
    .update({
      status: "queued",
      error_code: null,
      error_message: null,
      workflow_run_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("status", "failed")
    .select("*")
    .maybeSingle();
  if (error || !job)
    return NextResponse.json({ error: "failed job not found" }, { status: 404 });
  try {
    const run = await start(processPracticeAttempt, [id]);
    const { data: updated, error: updateError } = await service
      .from("practice_attempt_jobs")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json(updated, { status: 202 });
  } catch {
    await service
      .from("practice_attempt_jobs")
      .update({
        status: "failed",
        error_code: "workflow_start_failed",
        error_message: "We could not restart processing yet. Try again.",
      })
      .eq("id", id);
    return NextResponse.json(
      { error: "could not restart attempt processing" },
      { status: 503 },
    );
  }
}
