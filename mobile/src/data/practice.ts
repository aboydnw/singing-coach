import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  calibrationSchema,
  type Calibration,
  type ExerciseSpec,
  type ProposalMetadata,
  type StartingDirection,
} from "@/lib/schema";
import { attemptJobRequestSchema, ownsAudioKey } from "@/lib/attemptJobRequest";
import { selectVariedExercise } from "@/lib/exerciseSelection";
import {
  practiceSchema,
  sessionSchema,
  jobSchema,
  type PracticeBundle,
  type Job,
} from "./contracts";
import { createJournal, type KeyValueStorage } from "./journal";
import { boundedFetch } from "./network";
import { initialContract } from "./initialContract";

export type SendTake = {
  practiceId: string;
  wav: ArrayBuffer;
  spec: ExerciseSpec | null;
  metadata: ProposalMetadata;
  parentAttemptId?: string | null;
};
export type SendStage = "uploading" | "handing_off" | "durable";
export function createPracticeService(
  client: SupabaseClient,
  apiBaseUrl: string,
  deps: { storage: KeyValueStorage; randomUUID: () => string; fetch?: typeof fetch },
) {
  const requestFetch = boundedFetch(deps.fetch ?? fetch);
  const journal = createJournal(
    deps.storage,
    new URL(apiBaseUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, "_"),
  );
  let sending = false;
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Sign in first.");
    return data.user.id;
  }
  async function token(uid: string) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session || data.session.user.id !== uid)
      throw new Error("Your account changed. Sign in again.");
    return data.session.access_token;
  }
  function checked<T>(
    result: { data: unknown; error: { message: string } | null },
    schema: z.ZodType<T>,
  ): T {
    if (result.error) throw new Error(result.error.message);
    return schema.parse(result.data);
  }
  async function listPractices() {
    const uid = await identity();
    return checked(
      await client
        .from("practice_sessions")
        .select("*")
        .eq("user_id", uid)
        .order("started_at", { ascending: false })
        .limit(50),
      practiceSchema.array(),
    );
  }
  async function activePractice() {
    const uid = await identity();
    return checked(
      await client
        .from("practice_sessions")
        .select("*")
        .eq("user_id", uid)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      practiceSchema.nullable(),
    );
  }
  async function loadPractice(id: string): Promise<PracticeBundle> {
    z.string().uuid().parse(id);
    const uid = await identity();
    const [p, a, j] = await Promise.all([
      client
        .from("practice_sessions")
        .select("*")
        .eq("user_id", uid)
        .eq("id", id)
        .single(),
      client
        .from("sessions")
        .select("*")
        .eq("user_id", uid)
        .eq("practice_session_id", id)
        .order("ts", { ascending: false }),
      client
        .from("practice_attempt_jobs")
        .select("*")
        .eq("user_id", uid)
        .eq("practice_session_id", id)
        .order("created_at", { ascending: false }),
    ]);
    const bundle = {
      practice: checked(p, practiceSchema),
      attempts: checked(a, sessionSchema.array()),
      jobs: checked(j, jobSchema.array()),
    };
    if (
      bundle.practice.user_id !== uid ||
      bundle.practice.id !== id ||
      bundle.attempts.some(
        (row) => row.user_id !== uid || row.practice_session_id !== id,
      ) ||
      bundle.jobs.some((row) => row.user_id !== uid || row.practice_session_id !== id)
    )
      throw new Error("Invalid practice ownership.");
    return bundle;
  }
  async function latestCalibration(): Promise<Calibration | null> {
    const uid = await identity();
    return checked(
      await client
        .from("calibration")
        .select("range_low_midi,range_high_midi,tessitura_low_midi,tessitura_high_midi")
        .eq("user_id", uid)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle(),
      calibrationSchema.nullable(),
    );
  }
  async function saveCalibration(value: Calibration) {
    const parsed = calibrationSchema.parse(value);
    if (
      parsed.range_low_midi >= parsed.range_high_midi ||
      parsed.range_low_midi < 24 ||
      parsed.range_high_midi > 108
    )
      throw new Error("Choose a comfortable low note below your high note.");
    const uid = await identity();
    const { error } = await client.from("calibration").insert({
      ...parsed,
      id: deps.randomUUID(),
      user_id: uid,
      ts: new Date().toISOString(),
    });
    if (error) throw error;
  }
  async function createPractice(direction: StartingDirection) {
    if (await activePractice())
      throw new Error("End your active practice before starting a new one.");
    const uid = await identity();
    return checked(
      await client
        .from("practice_sessions")
        .insert({
          id: deps.randomUUID(),
          user_id: uid,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "in_progress",
          starting_direction: direction,
          learning_contract_json: initialContract(direction),
        })
        .select("*")
        .single(),
      practiceSchema,
    );
  }
  async function endPractice(id: string) {
    const bundle = await loadPractice(id);
    const uid = await identity();
    if (
      (await journal.read(uid)) ||
      bundle.jobs.some((j) => ["queued", "analyzing", "coaching"].includes(j.status))
    )
      throw new Error(
        "Resolve the recording handoff or wait for processing before ending practice.",
      );
    const contract =
      bundle.practice.learning_contract_json ??
      initialContract(bundle.practice.starting_direction);
    const now = new Date().toISOString();
    return checked(
      await client
        .from("practice_sessions")
        .update({
          status: "ended",
          ended_at: now,
          updated_at: now,
          learning_contract_json: contract,
          summary_json: {
            attemptCount: bundle.attempts.length,
            focus: contract.focus,
            strength: contract.strength,
            change: null,
          },
        })
        .eq("user_id", uid)
        .eq("id", id)
        .eq("status", "in_progress")
        .select("*")
        .single(),
      practiceSchema,
    );
  }
  function nextExercise(calibration: Calibration, bundle: PracticeBundle, cursor = 0) {
    if (bundle.practice.starting_direction === "free_sing") return null;
    return selectVariedExercise({
      calibration,
      cursor: bundle.attempts.length + cursor,
      focusArea: bundle.practice.learning_contract_json?.focusArea ?? null,
      history: bundle.attempts,
    }).spec;
  }
  async function findJob(uid: string, audioKey: string) {
    if (!ownsAudioKey(audioKey, uid)) throw new Error("Invalid recording ownership.");
    const job = checked(
      await client
        .from("practice_attempt_jobs")
        .select("*")
        .eq("user_id", uid)
        .eq("audio_key", audioKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      jobSchema.nullable(),
    );
    if (job && (job.user_id !== uid || job.audio_key !== audioKey))
      throw new Error("Invalid recording ownership.");
    return job;
  }
  async function recoverSend() {
    const uid = await identity();
    const pending = await journal.read(uid);
    if (!pending) return { pending: null, job: null };
    const job = await findJob(uid, pending.request.audio_key);
    if (job) {
      await journal.clear(uid);
      return { pending: null, job };
    }
    // Read-only recovery: a missing result does not prove a delayed POST failed.
    return { pending, job: null };
  }
  async function postJob(path: string, uid: string, body?: unknown): Promise<Job> {
    const response = await requestFetch(apiBaseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token(uid)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        "The processing service did not confirm this request. Check recording status before retrying.",
      );
    const job = jobSchema.parse(raw);
    if (job.user_id !== uid || !ownsAudioKey(job.audio_key, uid))
      throw new Error("Invalid job ownership.");
    return job;
  }
  async function sendTake(
    input: SendTake,
    onStage?: (stage: SendStage) => void,
  ): Promise<Job> {
    if (sending) throw new Error("A recording is already sending.");
    sending = true;
    try {
      const uid = await identity();
      if (await journal.read(uid))
        throw new Error(
          "Check the previous recording handoff before sending another take.",
        );
      const bundle = await loadPractice(input.practiceId);
      if (
        bundle.practice.status !== "in_progress" ||
        bundle.jobs.some((j) =>
          ["queued", "analyzing", "coaching", "failed"].includes(j.status),
        )
      )
        throw new Error("Resolve existing processing before sending another take.");
      if (
        input.parentAttemptId &&
        !bundle.attempts.some((a) => a.id === input.parentAttemptId)
      )
        throw new Error("Retry attempt not found in this practice.");
      if (input.wav.byteLength < 44 || input.wav.byteLength > 25 * 1024 * 1024)
        throw new Error("Recording size is invalid.");
      const header = new Uint8Array(input.wav, 0, 12);
      if (
        String.fromCharCode(...header.slice(0, 4)) !== "RIFF" ||
        String.fromCharCode(...header.slice(8, 12)) !== "WAVE"
      )
        throw new Error("Send a WAV recording.");
      const request = attemptJobRequestSchema.parse({
        practice_session_id: input.practiceId,
        audio_key: `${uid}/${deps.randomUUID()}.wav`,
        exercise_spec: input.spec,
        proposal_metadata: input.metadata,
        parent_attempt_id: input.parentAttemptId ?? null,
        attempt_kind: input.parentAttemptId ? "retry" : "initial",
      });
      const pending = {
        userId: uid,
        request,
        createdAt: new Date().toISOString(),
        phase: "uploading" as const,
      };
      await token(uid);
      await journal.write(pending);
      onStage?.("uploading");
      const uploaded = await client.storage
        .from("recordings")
        .upload(request.audio_key, input.wav, {
          contentType: "audio/wav",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;
      await journal.write({ ...pending, phase: "uploaded" });
      await token(uid);
      // Persist before POST: crash/network loss after this point must NEVER create a second job.
      await journal.write({ ...pending, phase: "handoff_unknown" });
      onStage?.("handing_off");
      let job: Job;
      try {
        job = await postJob("/api/practice/attempt-jobs", uid, request);
      } catch (error) {
        const recovered = await findJob(uid, request.audio_key);
        if (!recovered) throw error;
        job = recovered;
      }
      if (
        job.audio_key !== request.audio_key ||
        job.practice_session_id !== input.practiceId
      )
        throw new Error("Unexpected recording acknowledgement.");
      await journal.clear(uid);
      onStage?.("durable");
      return job;
    } finally {
      sending = false;
    }
  }
  async function resumeHandoff() {
    const uid = await identity();
    const pending = await journal.read(uid);
    if (!pending) throw new Error("No pending recording.");
    const existing = await findJob(uid, pending.request.audio_key);
    if (existing) {
      await journal.clear(uid);
      return existing;
    }
    if (pending.phase !== "uploaded")
      throw new Error(
        "This handoff is uncertain. Check again later; do not send a duplicate.",
      );
    await journal.write({ ...pending, phase: "handoff_unknown" });
    const job = await postJob("/api/practice/attempt-jobs", uid, pending.request);
    if (
      job.audio_key !== pending.request.audio_key ||
      job.practice_session_id !== pending.request.practice_session_id
    )
      throw new Error("Unexpected recording acknowledgement.");
    await journal.clear(uid);
    return job;
  }
  async function discardUnsentUpload() {
    const uid = await identity();
    const pending = await journal.read(uid);
    if (!pending) return;
    if (pending.phase === "handoff_unknown")
      throw new Error("Check the uncertain handoff before discarding.");
    const { error } = await client.storage
      .from("recordings")
      .remove([pending.request.audio_key]);
    if (error) throw error;
    await journal.clear(uid);
  }
  async function jobAction(job: Job, action: "retry" | "abandon") {
    const uid = await identity();
    if (job.user_id !== uid || job.status !== "failed")
      throw new Error("Only your failed job can be recovered.");
    const result = await postJob(
      `/api/practice/attempt-jobs/${z.string().uuid().parse(job.id)}/${action}`,
      uid,
    );
    if (
      result.id !== job.id ||
      result.practice_session_id !== job.practice_session_id ||
      result.audio_key !== job.audio_key
    )
      throw new Error("Unexpected processing response.");
    return result;
  }
  return {
    listPractices,
    activePractice,
    loadPractice,
    latestCalibration,
    saveCalibration,
    createPractice,
    endPractice,
    nextExercise,
    sendTake,
    recoverSend,
    resumeHandoff,
    discardUnsentUpload,
    retryJob: (job: Job) => jobAction(job, "retry"),
    abandonJob: (job: Job) => jobAction(job, "abandon"),
  };
}
export type PracticeService = ReturnType<typeof createPracticeService>;
