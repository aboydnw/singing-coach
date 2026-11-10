export type AudioState =
  | "ready"
  | "requesting"
  | "recording"
  | "stopping"
  | "review"
  | "error";
export type LocalTake = { uri: string; durationMs: number };
export type Snapshot = {
  state: AudioState;
  take: LocalTake | null;
  error: string | null;
  elapsedMs: number;
};
export interface Recorder {
  prepare(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
  uri(): string | null;
  release(): void;
}
export interface RecordingIO {
  permission(): Promise<boolean>;
  recordingMode(): Promise<void>;
  playbackMode(): Promise<void>;
  createRecorder(): Recorder;
  deleteFile(uri: string): void;
  stopPlayback(): void;
  validateTake?(uri: string): Promise<void>;
}
/** Owns local audio only. Cancellation invalidates pending permission and prepare work. */
export class RecordingSession {
  snapshot: Snapshot = { state: "ready", take: null, error: null, elapsedMs: 0 };
  private generation = 0;
  private recorder: Recorder | null = null;
  private started = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private discardPending = false;
  constructor(
    private io: RecordingIO,
    private changed: (s: Snapshot) => void,
    private maxMs = 60_000,
  ) {}
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (!this.disposed) this.changed(this.snapshot);
  }
  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private async disposeRecorder(recorder: Recorder, remove: boolean) {
    try {
      await recorder.stop();
    } catch {
      /* Preparing or interrupted recorders may already be stopped. */
    }
    const uri = recorder.uri();
    recorder.release();
    if (remove && uri) this.io.deleteFile(uri);
  }
  async start() {
    if (this.disposed || !["ready", "error"].includes(this.snapshot.state)) return;
    const generation = ++this.generation;
    const current = () => !this.disposed && generation === this.generation;
    this.discardPending = false;
    this.io.stopPlayback();
    this.publish({ state: "requesting", error: null, elapsedMs: 0 });
    let recorder: Recorder | null = null;
    try {
      if (!(await this.io.permission()))
        throw new Error(
          "Microphone permission is needed to record. You can enable it in Settings.",
        );
      if (!current()) return;
      await this.io.recordingMode();
      if (!current()) {
        await this.io.playbackMode();
        return;
      }
      recorder = this.io.createRecorder();
      this.recorder = recorder;
      await recorder.prepare();
      if (!current()) {
        await this.disposeRecorder(recorder, true);
        if (this.recorder === recorder) this.recorder = null;
        await this.io.playbackMode();
        return;
      }
      recorder.start();
      this.started = Date.now();
      this.publish({ state: "recording" });
      this.timer = setInterval(() => {
        const elapsedMs = Date.now() - this.started;
        this.publish({ elapsedMs });
        if (elapsedMs >= this.maxMs) void this.stop();
      }, 200);
    } catch (error) {
      if (recorder) await this.disposeRecorder(recorder, true);
      if (this.recorder === recorder) this.recorder = null;
      await this.io.playbackMode().catch(() => {});
      if (current())
        this.publish({
          state: "error",
          error: error instanceof Error ? error.message : "Recording could not start.",
        });
    } finally {
      if (!current())
        this.publish({ state: "ready", take: null, error: null, elapsedMs: 0 });
    }
  }
  async stop() {
    if (this.snapshot.state !== "recording" || !this.recorder) return;
    const recorder = this.recorder;
    const durationMs = Math.min(this.maxMs, Math.max(0, Date.now() - this.started));
    this.clearTimer();
    this.publish({ state: "stopping" });
    let take: LocalTake | null = null;
    let error: string | null = null;
    try {
      await recorder.stop();
      const uri = recorder.uri();
      if (!uri) throw new Error("No recording was saved.");
      await this.io.validateTake?.(uri);
      take = { uri, durationMs };
    } catch {
      error =
        "Recording was interrupted or could not be saved as mono WAV. Please try again.";
    } finally {
      const uri = recorder.uri();
      recorder.release();
      this.recorder = null;
      await this.io.playbackMode().catch(() => {});
      if (this.disposed || this.discardPending || error) {
        if (uri) this.io.deleteFile(uri);
        this.publish({
          state: error && !this.discardPending ? "error" : "ready",
          take: null,
          error,
          elapsedMs: 0,
        });
      } else this.publish({ state: "review", take, elapsedMs: take?.durationMs ?? 0 });
    }
  }
  async discard() {
    this.io.stopPlayback();
    if (this.snapshot.state === "stopping") {
      this.discardPending = true;
      return;
    }
    if (this.snapshot.state === "recording") {
      this.discardPending = true;
      await this.stop();
      return;
    }
    ++this.generation;
    if (this.snapshot.take) this.io.deleteFile(this.snapshot.take.uri);
    // Keep requesting until an in-flight prepare returns, preventing overlapping sessions.
    if (this.snapshot.state === "requesting") {
      this.publish({ state: "stopping" });
      return;
    }
    this.publish({ state: "ready", take: null, error: null, elapsedMs: 0 });
  }
  handleAppState(state: string) {
    if (state === "background") {
      this.interrupt();
    } else if (state === "inactive") {
      // iOS presents its microphone permission sheet as inactive. Do not cancel
      // our own request, but never keep recording or playing through inactivity.
      this.io.stopPlayback();
      if (this.snapshot.state === "recording") void this.stop();
    }
  }
  interrupt() {
    this.io.stopPlayback();
    if (this.snapshot.state === "recording") void this.stop();
    else if (this.snapshot.state === "requesting") void this.discard();
  }
  dispose() {
    this.disposed = true;
    this.clearTimer();
    void this.discard();
  }
}
