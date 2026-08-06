import {
  analyzeResponseSchema,
  coachingResponseSchema,
  type AnalyzeResponse,
} from "@/lib/schema";
import type { CoachingResponse, ExerciseSpec, Measurements } from "@/lib/schema";
import type { ContextAnchor } from "@/lib/schema";
import { accessToken, supabase, userId } from "@/lib/supabase";

export async function uploadRecording(
  wav: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error("not signed in");
  const key = `${uid}/${crypto.randomUUID()}.wav`;

  const { data, error } = await supabase()
    .storage.from("recordings")
    .createSignedUploadUrl(key);
  if (error || !data) throw new Error(error?.message ?? "could not sign upload");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl);
    xhr.setRequestHeader("Content-Type", "audio/wav");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload failed with status ${xhr.status}`));
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.ontimeout = () => reject(new Error("upload timed out"));
    xhr.send(wav);
  });

  return key;
}

export async function analyze(
  storageKey: string,
  exerciseSpec: ExerciseSpec | null,
  mode: "full" | "pitch_only" = "full",
): Promise<AnalyzeResponse> {
  const token = await accessToken();
  if (!token) throw new Error("not signed in");

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      storage_key: storageKey,
      exercise_spec: exerciseSpec,
      mode,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `analysis failed with status ${response.status}`);
  }
  return analyzeResponseSchema.parse(await response.json());
}

/** Ask the analysis runtime for a corrected version of a take, in the singer's
 * own voice. Returns the Storage key of the rendered clip. */
export async function resynthesize(
  storageKey: string,
  correction: string,
): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("not signed in");

  const response = await fetch("/api/resynth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ storage_key: storageKey, correction }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `resynthesis failed with status ${response.status}`);
  }
  const body = await response.json();
  if (typeof body.storage_key !== "string") {
    throw new Error("resynthesis returned no clip");
  }
  return body.storage_key;
}

export type HistoryEntry = {
  ts: string | null;
  exercise_type: string | null;
  measurements: Record<string, unknown> | null;
  advice_given?: {
    focus_area: string;
    top_issue: string;
    drill: string;
    state_id?: string;
    drill_id?: string;
  };
};

export async function coach(
  measurements: Measurements,
  exerciseSpec: ExerciseSpec | null,
  history: HistoryEntry[],
): Promise<CoachingResponse> {
  const token = await accessToken();
  if (!token) throw new Error("not signed in");

  const response = await fetch("/api/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      measurements,
      exercise_spec: exerciseSpec,
      history,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `coaching failed with status ${response.status}`);
  }
  return coachingResponseSchema.parse(await response.json());
}

export async function streamPracticeCoach(
  practiceSessionId: string,
  message: string,
  contextAnchor: ContextAnchor | null,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("not signed in");
  const response = await fetch("/api/practice/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal,
    body: JSON.stringify({
      practice_session_id: practiceSessionId,
      message,
      context_anchor: contextAnchor,
    }),
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `coaching failed with status ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let complete = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    complete += delta;
    onDelta(delta);
  }
  return complete;
}
