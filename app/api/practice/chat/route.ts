import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { groupExerciseThreads } from "@/lib/exerciseThreads";
import { buildExerciseChatHistory, practiceChatRequestSchema } from "@/lib/practiceChat";
import { coachingResponseSchema, measurementsSchema } from "@/lib/schema";
import { authenticateRequest } from "@/lib/serverAuth";
import { describeError, isTimeout, truncate } from "@/lib/openrouter";
import type { SessionRow } from "@/lib/sessions";
import { parseStoredJson } from "@/lib/storedJson";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY || !process.env.COACH_MODEL) {
    return NextResponse.json({ error: "coaching is not configured" }, { status: 500 });
  }
  const auth = await authenticateRequest(request);
  if (!auth)
    return NextResponse.json({ error: "invalid or missing token" }, { status: 401 });

  const parsed = practiceChatRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${auth.token}` } } },
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

  const { data: attempt, error: attemptError } = await client
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.attempt_id)
    .eq("practice_session_id", practice.id)
    .maybeSingle();
  if (attemptError || !attempt) {
    return NextResponse.json(
      { error: "attempt does not belong to this practice" },
      { status: 400 },
    );
  }

  const { data: userMessage, error: userMessageError } = await client
    .from("practice_messages")
    .select("id")
    .eq("id", parsed.data.user_message_id)
    .eq("practice_session_id", practice.id)
    .eq("attempt_id", attempt.id)
    .eq("role", "user")
    .maybeSingle();
  if (userMessageError || !userMessage) {
    return NextResponse.json({ error: "user message not found" }, { status: 400 });
  }

  const attemptsResult = await client
    .from("sessions")
    .select(
      "id, parent_attempt_id, attempt_kind, sequence_number, ts, exercise_type, measurements_json, coaching_json",
    )
    .eq("practice_session_id", practice.id)
    .order("sequence_number", { ascending: true })
    .order("ts", { ascending: true })
    .order("id", { ascending: true });
  if (attemptsResult.error) {
    return NextResponse.json(
      { error: "could not load practice context" },
      { status: 500 },
    );
  }
  const exercise = groupExerciseThreads((attemptsResult.data ?? []) as SessionRow[]).find(
    (thread) => thread.attemptIds.includes(attempt.id),
  );
  if (!exercise) {
    return NextResponse.json(
      { error: "attempt does not belong to an exercise" },
      { status: 400 },
    );
  }

  const messagesResult = await client
    .from("practice_messages")
    .select("id, attempt_id, role, content_json, status, created_at")
    .eq("practice_session_id", practice.id)
    .in("attempt_id", exercise.attemptIds)
    .eq("status", "complete")
    .order("created_at", { ascending: false });
  if (messagesResult.error) {
    return NextResponse.json(
      { error: "could not load practice context" },
      { status: 500 },
    );
  }

  const assistantId = crypto.randomUUID();
  const { error: messageError } = await client.from("practice_messages").insert({
    id: assistantId,
    practice_session_id: practice.id,
    attempt_id: attempt.id,
    user_id: auth.userId,
    role: "assistant",
    content_json: { text: "" },
    context_anchor_json: parsed.data.context_anchor,
    status: "streaming",
    client_request_id: parsed.data.client_request_id,
    completed_at: null,
  });
  if (messageError && messageError.code !== "23505") {
    return NextResponse.json(
      { error: "could not start the coach response" },
      { status: 500 },
    );
  }

  const history = buildExerciseChatHistory(
    messagesResult.data ?? [],
    new Set(exercise.attemptIds),
    parsed.data.user_message_id,
  );
  const context = {
    starting_direction: practice.starting_direction,
    practice_compass: practice.learning_contract_json,
    attempts: exercise.attempts.map((attempt) => ({
      sequence_number: attempt.sequence_number,
      exercise_type: attempt.exercise_type,
      measurements: parseStoredJson(attempt.measurements_json, measurementsSchema),
      assessment: parseStoredJson(attempt.coaching_json, coachingResponseSchema),
    })),
    selected_context: parsed.data.context_anchor,
  };

  const upstreamController = new AbortController();
  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Singing Coach Practice",
      },
      signal: AbortSignal.any([AbortSignal.timeout(110_000), upstreamController.signal]),
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
    });
  } catch (error) {
    await markMessageFailed(
      client,
      practice.id,
      attempt.id,
      parsed.data.client_request_id,
    );
    return NextResponse.json(
      { error: isTimeout(error) ? "the coach timed out" : "could not reach the coach" },
      { status: isTimeout(error) ? 504 : 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = describeError(await upstream.text().catch(() => ""));
    await markMessageFailed(
      client,
      practice.id,
      attempt.id,
      parsed.data.client_request_id,
    );
    return NextResponse.json(
      {
        error: truncate(
          `the coach returned ${upstream.status}${detail ? `: ${detail}` : ""}`,
        ),
      },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let complete = "";
  let stopped = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const persistStreaming = async () => {
    await client
      .from("practice_messages")
      .update({ content_json: { text: complete } })
      .eq("practice_session_id", practice.id)
      .eq("attempt_id", attempt.id)
      .eq("client_request_id", parsed.data.client_request_id)
      .eq("status", "streaming");
  };
  const finishMessage = async (status: "complete" | "failed" | "stopped") => {
    await client
      .from("practice_messages")
      .update({
        content_json: { text: complete },
        status,
        completed_at: new Date().toISOString(),
      })
      .eq("practice_session_id", practice.id)
      .eq("attempt_id", attempt.id)
      .eq("client_request_id", parsed.data.client_request_id);
  };
  const stream = new ReadableStream({
    async start(controller) {
      reader = upstream.body!.getReader();
      const flushTimer = setInterval(() => void persistStreaming(), 2_000);
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
              if (typeof delta === "string") {
                complete += delta;
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // Ignore keepalive and provider metadata frames.
            }
          }
        }
        if (!stopped) {
          await finishMessage("complete");
          controller.close();
        }
      } catch (error) {
        if (!stopped) {
          await finishMessage("failed");
          controller.error(error);
        }
      } finally {
        clearInterval(flushTimer);
        reader?.releaseLock();
        reader = null;
      }
    },
    async cancel() {
      stopped = true;
      upstreamController.abort();
      await reader?.cancel().catch(() => undefined);
      await finishMessage("stopped");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

async function markMessageFailed(
  client: SupabaseClient,
  practiceId: string,
  attemptId: string,
  clientRequestId: string,
) {
  await client
    .from("practice_messages")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("practice_session_id", practiceId)
    .eq("attempt_id", attemptId)
    .eq("client_request_id", clientRequestId);
}
