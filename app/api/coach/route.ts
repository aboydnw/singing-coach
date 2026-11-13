import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  coachRequestSchema,
  generateCoaching,
  type CoachRequest,
} from "@/lib/coachService";
import { authenticateRequest } from "@/lib/serverAuth";

import { CostLimitError, costLimitResponse } from "@/lib/costGuard";
import { readBoundedJson, RequestSizeError } from "@/lib/requestLimits";

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
    body = coachRequestSchema.parse(await readBoundedJson(request));
  } catch (error) {
    return NextResponse.json(
      { error: "invalid or oversized request body" },
      { status: error instanceof RequestSizeError ? 413 : 400 },
    );
  }

  try {
    const result = await generateCoaching(
      body,
      await countSessions(auth.token),
      auth.userId,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CostLimitError) return costLimitResponse(error);
    if (error instanceof RequestSizeError)
      return NextResponse.json({ error: error.message }, { status: 413 });
    const message = error instanceof Error ? error.message : "coaching failed";
    const status = message === "coaching is not configured on the server" ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
