import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { serviceSupabase } from "@/lib/serverSupabase";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });
  }
  const { id } = await context.params;
  const { data, error } = await serviceSupabase()
    .from("practice_attempt_jobs")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("status", "failed")
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "failed job not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
