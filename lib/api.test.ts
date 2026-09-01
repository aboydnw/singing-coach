import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadRecording } from "@/lib/api";

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
