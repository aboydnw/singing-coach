import { analyzeResponseSchema, type AnalyzeResponse } from "@/lib/schema";
import type { CoachingResult, ExerciseSpec, Measurements } from "@/lib/schema";
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

export type HistoryEntry = {
  ts: string | null;
  exercise_type: string | null;
  measurements: Record<string, unknown> | null;
  advice_given?: { focus_area: string; top_issue: string; drill: string };
};

export async function coach(
  measurements: Measurements,
  exerciseSpec: ExerciseSpec | null,
  history: HistoryEntry[],
): Promise<CoachingResult> {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const { coachingResultSchema } = await import("@/lib/schema");
  return coachingResultSchema.parse(await response.json());
}
