import { describe, expect, it, vi } from "vitest";
import { RecordingSession, type RecordingIO } from "./RecordingSession";
import { assertMonoPcmWav } from "./wav";
import { renderTimedSequenceWavBytes } from "../../../lib/referenceTone";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup() {
  const recorder = {
    prepare: vi.fn(async () => {}),
    start: vi.fn(),
    stop: vi.fn(async () => {}),
    uri: () => "file:///take.wav",
    release: vi.fn(),
  };
  const io: RecordingIO = {
    permission: vi.fn(async () => true),
    recordingMode: vi.fn(async () => {}),
    playbackMode: vi.fn(async () => {}),
    createRecorder: vi.fn(() => recorder),
    deleteFile: vi.fn(),
    stopPlayback: vi.fn(),
  };
  return { recorder, io, session: new RecordingSession(io, () => {}) };
}
describe("local recording lifecycle", () => {
  it("allows the microphone permission sheet to become inactive before grant", async () => {
    const { io, session, recorder } = setup();
    const permission = deferred<boolean>();
    io.permission = () => permission.promise;
    const start = session.start();
    session.handleAppState("inactive");
    expect(session.snapshot.state).toBe("requesting");
    session.handleAppState("active");
    permission.resolve(true);
    await start;
    expect(recorder.start).toHaveBeenCalledOnce();
    expect(session.snapshot.state).toBe("recording");
    await session.discard();
  });
  it("cancels a pending permission request on true background", async () => {
    const { io, session } = setup();
    const permission = deferred<boolean>();
    io.permission = () => permission.promise;
    const start = session.start();
    session.handleAppState("inactive");
    session.handleAppState("background");
    permission.resolve(true);
    await start;
    expect(io.createRecorder).not.toHaveBeenCalled();
    expect(session.snapshot.state).toBe("ready");
  });
  it("stops active recording and playback on inactive", async () => {
    const { io, session } = setup();
    await session.start();
    vi.mocked(io.stopPlayback).mockClear();
    session.handleAppState("inactive");
    await vi.waitFor(() => expect(session.snapshot.state).toBe("review"));
    expect(io.stopPlayback).toHaveBeenCalled();
    session.dispose();
  });
  it("caps the take duration and retains the finished take locally", async () => {
    vi.useFakeTimers();
    try {
      const { io } = setup();
      const session = new RecordingSession(io, () => {}, 1000);
      await session.start();
      await vi.advanceTimersByTimeAsync(1200);
      expect(session.snapshot.state).toBe("review");
      expect(session.snapshot.take?.durationMs).toBe(1000);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
  it("fails closed when native output is not accepted WAV", async () => {
    const { io, session } = setup();
    io.validateTake = async () => {
      throw new Error("bad WAV");
    };
    await session.start();
    await session.stop();
    expect(session.snapshot.state).toBe("error");
    expect(session.snapshot.take).toBeNull();
    expect(io.deleteFile).toHaveBeenCalledOnce();
  });
  it("deletes a take that finishes stopping after unmount", async () => {
    const { recorder, io, session } = setup();
    await session.start();
    const stopped = deferred<void>();
    recorder.stop.mockImplementation(() => stopped.promise);
    const stop = session.stop();
    session.dispose();
    stopped.resolve();
    await stop;
    expect(io.deleteFile).toHaveBeenCalledOnce();
    expect(recorder.release).toHaveBeenCalledOnce();
  });
  it("does not create a late recorder after permission cancellation", async () => {
    const { io, session } = setup();
    const permission = deferred<boolean>();
    io.permission = () => permission.promise;
    const start = session.start();
    await session.discard();
    expect(session.snapshot.state).toBe("stopping");
    permission.resolve(true);
    await start;
    expect(io.createRecorder).not.toHaveBeenCalled();
    expect(session.snapshot.state).toBe("ready");
  });
  it("closes a recorder whose preparation finishes after cancellation", async () => {
    const { recorder, session, io } = setup();
    const prepare = deferred<void>();
    recorder.prepare.mockImplementation(() => prepare.promise);
    const start = session.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await session.discard();
    prepare.resolve();
    await start;
    expect(recorder.start).not.toHaveBeenCalled();
    expect(recorder.release).toHaveBeenCalledOnce();
    expect(io.deleteFile).toHaveBeenCalledWith("file:///take.wav");
    expect(session.snapshot.state).toBe("ready");
  });
  it("guards repeated starts and stops, retains review until explicit discard", async () => {
    const { recorder, session, io } = setup();
    await Promise.all([session.start(), session.start()]);
    expect(recorder.start).toHaveBeenCalledOnce();
    await Promise.all([session.stop(), session.stop()]);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.take?.uri).toBe("file:///take.wav");
    expect(io.deleteFile).not.toHaveBeenCalled();
    await session.discard();
    expect(io.deleteFile).toHaveBeenCalledOnce();
  });
  it("discards a stopping take rather than exposing it for upload", async () => {
    const { recorder, session, io } = setup();
    await session.start();
    const stopped = deferred<void>();
    recorder.stop.mockImplementation(() => stopped.promise);
    const stop = session.stop();
    await session.discard();
    stopped.resolve();
    await stop;
    expect(session.snapshot.take).toBeNull();
    expect(session.snapshot.state).toBe("ready");
    expect(io.deleteFile).toHaveBeenCalledOnce();
  });
  it("ends foreground recording on interruption and preserves local review", async () => {
    const { session } = setup();
    await session.start();
    session.interrupt();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(session.snapshot.state).toBe("review"));
    session.dispose();
  });
});
describe("portable pitch guide", () => {
  it("rejects truncated and non-WAV files", () => {
    expect(() => assertMonoPcmWav(new Uint8Array(100))).toThrow();
    const bytes = renderTimedSequenceWavBytes([{ kind: "rest", duration_s: 0.1 }]);
    expect(() => assertMonoPcmWav(bytes.slice(0, -4))).toThrow("Incomplete WAV");
  });
  it("renders mono PCM16 WAV without a Blob dependency", () => {
    const bytes = renderTimedSequenceWavBytes(
      [{ kind: "note", midi: 69, duration_s: 0.1 }],
      48_000,
    );
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(bytes.length).toBe(44 + 4800 * 2);
    expect(() => assertMonoPcmWav(bytes)).not.toThrow();
    view.setUint16(22, 2, true);
    expect(() => assertMonoPcmWav(bytes)).toThrow("mono PCM16");
  });
});
