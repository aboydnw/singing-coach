import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  coachRequestSchema,
  generateCoaching,
  type CoachRequest,
} from "@/lib/coachService";
import { authenticateRequest } from "@/lib/serverAuth";

export const maxDuration = 120;

async function countSessions(token: string): Promise<number | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { count, error } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth === null) {
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });
  }

  let body: CoachRequest;
  try {
    body = coachRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  try {
    const result = await generateCoaching(body, await countSessions(auth.token));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "coaching failed";
    const status = message === "coaching is not configured on the server" ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
