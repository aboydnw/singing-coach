import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contextAnchorSchema } from "@/lib/schema";

export const maxDuration = 120;

const requestSchema = z.object({
  practice_session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  context_anchor: contextAnchorSchema.nullable().default(null),
});

async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await client.auth.getUser(token);
  return !error && data.user ? token : null;
}

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY || !process.env.COACH_MODEL) {
    return NextResponse.json({ error: "coaching is not configured" }, { status: 500 });
  }
  const token = await authenticate(request);
  if (!token)
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: practice, error: practiceError } = await client
    .from("practice_sessions")
    .select("id, status, starting_direction, learning_contract_json")
    .eq("id", parsed.data.practice_session_id)
    .single();
  if (practiceError || !practice)
    return NextResponse.json({ error: "practice not found" }, { status: 404 });
  if (practice.status !== "in_progress")
    return NextResponse.json({ error: "this practice has ended" }, { status: 409 });

  const [attemptsResult, messagesResult] = await Promise.all([
    client
      .from("sessions")
      .select("exercise_type, measurements_json, coaching_json, sequence_number")
      .eq("practice_session_id", practice.id)
      .order("sequence_number", { ascending: true })
      .limit(30),
    client
      .from("practice_messages")
      .select("role, content_json")
      .eq("practice_session_id", practice.id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (attemptsResult.error || messagesResult.error) {
    return NextResponse.json(
      { error: "could not load practice context" },
      { status: 500 },
    );
  }

  const recent = (messagesResult.data ?? []).reverse();
  if (
    recent.at(-1)?.role === "user" &&
    String(recent.at(-1)?.content_json?.text ?? "") === parsed.data.message
  ) {
    recent.pop();
  }
  const history = recent.map((message) => ({
    role: message.role,
    content: String(message.content_json?.text ?? ""),
  }));
  const context = {
    starting_direction: practice.starting_direction,
    practice_compass: practice.learning_contract_json,
    attempts: (attemptsResult.data ?? []).map((attempt) => ({
      sequence_number: attempt.sequence_number,
      exercise_type: attempt.exercise_type,
      measurements: safeJson(attempt.measurements_json),
      assessment: safeJson(attempt.coaching_json),
    })),
    selected_context: parsed.data.context_anchor,
  };

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Singing Coach Practice",
    },
    signal: AbortSignal.timeout(110_000),
    body: JSON.stringify({
      model: process.env.COACH_MODEL,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are the singer's vocal coach inside an active practice. Answer the current question in plain language and stay anchored to the supplied measurements, original assessments, canonical cues, and selected context. Clarify; do not rewrite prior measurements or assessments. Give at most one actionable cue at a time. Use an external sound target rather than anatomical manipulation. Clearly distinguish observation from inference. If evidence cannot answer, say so. If the singer reports pain, tell them to stop and rest. Keep the answer concise enough to act on immediately.",
        },
        { role: "system", content: `Practice context:\n${JSON.stringify(context)}` },
        ...history,
        { role: "user", content: parsed.data.message },
      ],
    }),
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "the coach could not respond" }, { status: 502 });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const payload = JSON.parse(data);
              const delta = payload.choices?.[0]?.delta?.content;
              if (typeof delta === "string") controller.enqueue(encoder.encode(delta));
            } catch {
              // Ignore keepalive and provider metadata frames.
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
