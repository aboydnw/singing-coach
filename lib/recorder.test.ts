import { describe, expect, it, vi } from "vitest";
import { createRecorderController, microphoneErrorMessage } from "@/lib/recorder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const permission = deferred<MediaStream>();
  const wav = new Blob(["native-rate wav"]);
  const recorder = {
    mimeType: "audio/webm",
    start: vi.fn(),
    stop: vi.fn(),
    onstop: null,
    onerror: null,
    ondataavailable: null,
  } as unknown as MediaRecorder;
  const deps = {
    getUserMedia: vi.fn(() => permission.promise),
    createRecorder: vi.fn(() => recorder),
    encode: vi.fn(async (_blob: Blob) => wav),
    upload: vi.fn(
      async (_wav: Blob, _progress: (fraction: number) => void, _signal: AbortSignal) =>
        "private/recording.wav",
    ),
    onState: vi.fn(),
    onUploaded: vi.fn(),
  };
  const controller = createRecorderController(deps);
  const finish = () => recorder.onstop?.call(recorder, new Event("stop"));
  const start = async () => {
    const pending = controller.start();
    permission.resolve(stream);
    await pending;
    recorder.ondataavailable?.call(recorder, { data: new Blob(["take"]) } as BlobEvent);
  };
  return {
    controller,
    deps,
    permission,
    stream,
    stopTrack,
    recorder,
    finish,
    start,
    wav,
  };
}

describe("microphoneErrorMessage", () => {
  it.each([
    ["NotAllowedError", "Microphone access is blocked"],
    ["NotFoundError", "No microphone was found"],
    ["NotReadableError", "Close other apps"],
    ["NotSupportedError", "This browser cannot record"],
    ["SecurityError", "over HTTPS"],
  ])("gives a specific recovery for %s", (name, expected) => {
    expect(
      microphoneErrorMessage(new DOMException("raw browser detail", name)),
    ).toContain(expected);
  });

  it("does not blame permission for an unknown setup failure", () => {
    expect(microphoneErrorMessage(new Error("internal detail"))).toContain(
      "Recording could not start",
    );
    expect(microphoneErrorMessage(null)).not.toContain("denied");
  });
});

describe("recorder lifecycle", () => {
  it("keeps stopped audio local until explicit confirmation", async () => {
    const h = harness();
    await h.start();
    h.controller.stop();
    await h.finish();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "review" });
    expect(h.stopTrack).toHaveBeenCalled();
    await h.controller.start();
    expect(h.deps.getUserMedia).toHaveBeenCalledOnce();
    expect(h.deps.encode).not.toHaveBeenCalled();
    expect(h.deps.upload).not.toHaveBeenCalled();
    expect(h.deps.onUploaded).not.toHaveBeenCalled();
  });

  it.each(["recording", "stopping", "review"])(
    "discards %s without any upload or analysis callback",
    async (phase) => {
      const h = harness();
      await h.start();
      const oldStop = h.recorder.onstop!;
      const oldData = h.recorder.ondataavailable!;
      if (phase !== "recording") h.controller.stop();
      if (phase === "review") await h.finish();
      h.controller.discard();
      h.controller.discard();
      await h.controller.submit();
      expect(h.stopTrack).toHaveBeenCalled();
      expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "idle" });
      await h.controller.start();
      oldData.call(h.recorder, { data: new Blob(["late old audio"]) } as BlobEvent);
      oldStop.call(h.recorder, new Event("stop"));
      expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "recording" });
      expect(h.deps.encode).not.toHaveBeenCalled();
      expect(h.deps.upload).not.toHaveBeenCalled();
      expect(h.deps.onUploaded).not.toHaveBeenCalled();
    },
  );

  it("does not submit on an unexpected stop or after review teardown", async () => {
    const h = harness();
    await h.start();
    await h.finish();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "review" });
    h.controller.dispose();
    await h.controller.submit();
    expect(h.deps.encode).not.toHaveBeenCalled();
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("recovers from an empty take without upload", async () => {
    const h = harness();
    const pending = h.controller.start();
    h.permission.resolve(h.stream);
    await pending;
    h.controller.stop();
    await h.finish();
    await h.controller.submit();
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: expect.stringContaining("No audio"),
    });
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("releases the microphone if stop throws", async () => {
    const h = harness();
    await h.start();
    vi.mocked(h.recorder.stop).mockImplementation(() => {
      throw new Error("inactive");
    });
    h.controller.stop();
    await h.finish();
    expect(h.stopTrack).toHaveBeenCalled();
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: expect.stringContaining("could not stop"),
    });
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("cancels a pending request and closes a late grant without recording or uploading", async () => {
    const h = harness();
    const pending = h.controller.start();
    h.controller.cancelRequest();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "idle" });
    h.permission.resolve(h.stream);
    await pending;
    expect(h.stopTrack).toHaveBeenCalledOnce();
    expect(h.deps.createRecorder).not.toHaveBeenCalled();
    expect(h.deps.encode).not.toHaveBeenCalled();
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("ignores an old rejection after cancellation and a newer recording", async () => {
    const h = harness();
    const old = h.controller.start();
    h.controller.cancelRequest();
    h.deps.getUserMedia.mockResolvedValueOnce(h.stream);
    await h.controller.start();
    h.permission.reject(new DOMException("blocked", "NotAllowedError"));
    await old;
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "recording" });
    expect(h.stopTrack).not.toHaveBeenCalled();
  });

  it("does not let a late old grant stop a newer stream", async () => {
    const h = harness();
    const oldStop = vi.fn();
    const oldStream = { getTracks: () => [{ stop: oldStop }] } as unknown as MediaStream;
    const old = h.controller.start();
    h.controller.cancelRequest();
    h.deps.getUserMedia.mockResolvedValueOnce(h.stream);
    await h.controller.start();
    h.permission.resolve(oldStream);
    await old;
    expect(oldStop).toHaveBeenCalledOnce();
    expect(h.stopTrack).not.toHaveBeenCalled();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "recording" });
  });

  it("locks repeated starts and stops before React renders", async () => {
    const h = harness();
    const pending = h.controller.start();
    await h.controller.start();
    expect(h.deps.getUserMedia).toHaveBeenCalledOnce();
    h.permission.resolve(h.stream);
    await pending;
    h.controller.stop();
    h.controller.stop();
    expect(h.recorder.stop).toHaveBeenCalledOnce();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "stopping" });
  });

  it("encodes once, forwards the WAV unchanged, and reports upload before handing off", async () => {
    const h = harness();
    await h.start();
    h.controller.stop();
    await h.finish();
    await h.finish();
    await h.controller.submit();
    await h.controller.submit();
    expect(await h.deps.encode.mock.calls[0][0].text()).toBe("take");
    expect(h.deps.encode).toHaveBeenCalledOnce();
    expect(h.deps.upload.mock.calls[0][0]).toBe(h.wav);
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "done",
      storageKey: "private/recording.wav",
    });
    expect(h.deps.onUploaded).toHaveBeenCalledExactlyOnceWith("private/recording.wav");
    expect(h.deps.onState.mock.invocationCallOrder.at(-1)).toBeLessThan(
      h.deps.onUploaded.mock.invocationCallOrder[0],
    );
  });

  it("recovers from permission failure without requiring a reload", async () => {
    const h = harness();
    const pending = h.controller.start();
    h.permission.reject(new DOMException("missing", "NotFoundError"));
    await pending;
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: expect.stringContaining("No microphone"),
    });
    h.deps.getUserMedia.mockResolvedValueOnce(h.stream);
    await h.controller.start();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "recording" });
  });

  it("releases the stream if recorder construction fails", async () => {
    const h = harness();
    h.deps.createRecorder.mockImplementation(() => {
      throw new DOMException("unsupported", "NotSupportedError");
    });
    await h.start();
    expect(h.stopTrack).toHaveBeenCalledOnce();
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: expect.stringContaining("This browser cannot record"),
    });
  });

  it("does not encode or upload after an interrupted recorder", async () => {
    const h = harness();
    await h.start();
    h.recorder.onerror?.call(h.recorder, new Event("error"));
    await h.finish();
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: expect.stringContaining("interrupted"),
    });
    expect(h.stopTrack).toHaveBeenCalled();
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("releases a stream that arrives after unmount without changing state", async () => {
    const h = harness();
    const pending = h.controller.start();
    h.controller.dispose();
    const calls = h.deps.onState.mock.calls.length;
    h.permission.resolve(h.stream);
    await pending;
    expect(h.stopTrack).toHaveBeenCalledOnce();
    expect(h.deps.onState).toHaveBeenCalledTimes(calls);
    expect(h.recorder.start).not.toHaveBeenCalled();
  });

  it("does not process the recorder's teardown stop event", async () => {
    const h = harness();
    await h.start();
    h.controller.dispose();
    await h.finish();
    expect(h.stopTrack).toHaveBeenCalled();
    expect(h.deps.encode).not.toHaveBeenCalled();
  });

  it("does not upload if unmounted during encoding", async () => {
    const h = harness();
    const encoding = deferred<Blob>();
    h.deps.encode.mockReturnValue(encoding.promise);
    await h.start();
    h.controller.stop();
    await h.finish();
    const pending = h.controller.submit();
    h.controller.dispose();
    encoding.resolve(h.wav);
    await pending;
    expect(h.deps.upload).not.toHaveBeenCalled();
  });

  it("aborts upload and ignores late progress or success after unmount", async () => {
    const h = harness();
    const upload = deferred<string>();
    h.deps.upload.mockReturnValue(upload.promise);
    await h.start();
    h.controller.stop();
    await h.finish();
    const pending = h.controller.submit();
    await Promise.resolve();
    const [, progress, signal] = h.deps.upload.mock.calls[0];
    progress(0.5);
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "uploading",
      fraction: 0.5,
    });
    h.controller.dispose();
    const calls = h.deps.onState.mock.calls.length;
    progress(1);
    upload.resolve("late.wav");
    await pending;
    expect(signal.aborted).toBe(true);
    expect(h.deps.onState).toHaveBeenCalledTimes(calls);
    expect(h.deps.onUploaded).not.toHaveBeenCalled();
  });

  it("preserves save errors and allows another take", async () => {
    const h = harness();
    h.deps.upload.mockRejectedValueOnce(new Error("upload timed out"));
    await h.start();
    h.controller.stop();
    await h.finish();
    await h.controller.submit();
    expect(h.deps.onState).toHaveBeenLastCalledWith({
      phase: "error",
      message: "upload timed out",
    });
    expect(h.deps.onUploaded).not.toHaveBeenCalled();
    await h.controller.start();
    expect(h.deps.onState).toHaveBeenLastCalledWith({ phase: "recording" });
  });
});
