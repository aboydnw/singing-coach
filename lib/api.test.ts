import { afterEach, describe, expect, it, vi } from "vitest";
import { startAttemptJob, uploadRecording } from "@/lib/api";

vi.mock("@/lib/supabase", () => ({
  accessToken: vi.fn(async () => "token"),
  userId: vi.fn(async () => "user-1"),
  supabase: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({
          data: { signedUrl: "https://uploads.example.test/recording" },
          error: null,
        }),
      }),
    },
  }),
}));

class PendingUploadRequest {
  static latest: PendingUploadRequest | null = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  status = 0;
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;

  constructor() {
    PendingUploadRequest.latest = this;
  }

  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

afterEach(() => {
  PendingUploadRequest.latest = null;
  vi.unstubAllGlobals();
});

describe("uploadRecording", () => {
  it("aborts an in-flight upload when its recorder is disposed", async () => {
    vi.stubGlobal("XMLHttpRequest", PendingUploadRequest);
    const controller = new AbortController();
    const upload = uploadRecording(new Blob(["wav"]), undefined, controller.signal);

    await vi.waitFor(() => expect(PendingUploadRequest.latest).not.toBeNull());
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(PendingUploadRequest.latest?.aborted).toBe(true);
  });

  it("does not begin an upload for an already-disposed recorder", async () => {
    vi.stubGlobal("XMLHttpRequest", PendingUploadRequest);
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadRecording(new Blob(["wav"]), undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(PendingUploadRequest.latest).toBeNull();
  });
});

describe("startAttemptJob", () => {
  it("hands immutable proposal context to the durable endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "job-1",
            status: "queued",
            practice_session_id: "11111111-1111-1111-1111-111111111101",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await startAttemptJob({
      practice_session_id: "11111111-1111-1111-1111-111111111101",
      audio_key: "user-1/take.wav",
      exercise_spec: null,
      proposal_metadata: {
        reason: "Sing freely",
        activity_id: null,
        activity_version: null,
        transposition_semitones: null,
        reference_fallback: false,
      },
      parent_attempt_id: null,
      attempt_kind: "initial",
    });
    expect(result.id).toBe("job-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/practice/attempt-jobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
});
