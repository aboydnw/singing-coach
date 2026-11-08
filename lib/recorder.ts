export type RecorderState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "recording" }
  | { phase: "stopping" }
  | { phase: "review" }
  | { phase: "encoding" }
  | { phase: "uploading"; fraction: number }
  | { phase: "done"; storageKey: string }
  | { phase: "error"; message: string };

export function isRecorderBusy(state: RecorderState): boolean {
  return [
    "requesting",
    "recording",
    "stopping",
    "review",
    "encoding",
    "uploading",
  ].includes(state.phase);
}

/** A missing or busy microphone is not the same as denying permission. */
export function microphoneErrorMessage(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone access is blocked. Allow the microphone in this site's browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect a microphone or check your device's audio input, then try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your microphone could not start. Close other apps using it, check your device's microphone settings, then try again.";
    case "SecurityError":
      return "Microphone access is unavailable on this page. Open Singing Coach in a browser over HTTPS, then try again.";
    case "NotSupportedError":
      return "This browser cannot record audio here. Try a current version of Safari, Chrome, or Firefox.";
    default:
      return "Recording could not start. Check your microphone and browser settings, then try again.";
  }
}

type RecorderDependencies = {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  encode: (blob: Blob) => Promise<Blob>;
  upload: (
    wav: Blob,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ) => Promise<string>;
  onState: (state: RecorderState) => void;
  onUploaded: (storageKey: string) => void;
};

/** Owns one live take. Invalidated microphone requests never start or upload audio. */
export function createRecorderController(deps: RecorderDependencies) {
  let state: RecorderState = { phase: "idle" };
  let operation = 0;
  let disposed = false;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let uploadAbort: AbortController | null = null;
  let pendingTake: Blob | null = null;
  let clearTake: (() => void) | null = null;

  const setState = (next: RecorderState) => {
    state = next;
    deps.onState(next);
  };
  const stopTracks = (source: MediaStream | null) => {
    source?.getTracks().forEach((track) => track.stop());
  };
  const current = (id: number) => !disposed && id === operation;

  const start = async () => {
    if (disposed || isRecorderBusy(state)) return;
    const id = ++operation;
    let requestedStream: MediaStream | null = null;
    setState({ phase: "requesting" });
    try {
      requestedStream = await deps.getUserMedia();
      if (!current(id)) {
        stopTracks(requestedStream);
        return;
      }
      stream = requestedStream;
      const take = deps.createRecorder(requestedStream);
      recorder = take;
      const chunks: Blob[] = [];
      clearTake = () => {
        chunks.length = 0;
        take.ondataavailable = null;
        take.onstop = null;
        take.onerror = null;
      };
      let processing = false;
      take.ondataavailable = (event) => {
        if (current(id)) chunks.push(event.data);
      };
      take.onerror = () => {
        if (!current(id)) return;
        operation += 1;
        clearTake?.();
        clearTake = null;
        recorder = null;
        stream = null;
        stopTracks(requestedStream);
        setState({
          phase: "error",
          message: "Recording was interrupted. Check your microphone, then record again.",
        });
      };
      take.onstop = () => {
        if (!current(id) || processing) return;
        stopTracks(requestedStream);
        processing = true;
        recorder = null;
        stream = null;
        pendingTake = new Blob(chunks, { type: take.mimeType || "audio/webm" });
        clearTake?.();
        clearTake = null;
        if (!pendingTake.size) {
          pendingTake = null;
          setState({
            phase: "error",
            message: "No audio was captured. Please record again.",
          });
          return;
        }
        setState({ phase: "review" });
      };
      take.start();
      setState({ phase: "recording" });
    } catch (error) {
      stopTracks(requestedStream);
      if (!current(id)) return;
      clearTake?.();
      clearTake = null;
      recorder = null;
      stream = null;
      setState({ phase: "error", message: microphoneErrorMessage(error) });
    }
  };

  const submit = async () => {
    if (disposed || state.phase !== "review" || !pendingTake) return;
    const id = operation;
    const blob = pendingTake;
    pendingTake = null;
    try {
      setState({ phase: "encoding" });
      const wav = await deps.encode(blob);
      if (!current(id)) return;
      const controller = new AbortController();
      uploadAbort = controller;
      setState({ phase: "uploading", fraction: 0 });
      const key = await deps.upload(
        wav,
        (fraction) => {
          if (current(id)) setState({ phase: "uploading", fraction });
        },
        controller.signal,
      );
      if (!current(id)) return;
      uploadAbort = null;
      setState({ phase: "done", storageKey: key });
      deps.onUploaded(key);
    } catch (error) {
      if (!current(id)) return;
      uploadAbort = null;
      setState({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "Recording could not be saved. Please try again.",
      });
    }
  };

  return {
    start,
    submit,
    stop() {
      if (disposed || state.phase !== "recording" || !recorder) return;
      // Lock synchronously; repeated Stop clicks must not call MediaRecorder.stop twice.
      setState({ phase: "stopping" });
      try {
        recorder.stop();
      } catch {
        operation += 1;
        clearTake?.();
        clearTake = null;
        stopTracks(stream);
        recorder = null;
        stream = null;
        setState({
          phase: "error",
          message: "Recording could not stop. Please record again.",
        });
      }
    },
    discard() {
      if (disposed || !["recording", "stopping", "review"].includes(state.phase)) return;
      // Invalidate before stopping tracks: browsers may queue data/stop events.
      operation += 1;
      pendingTake = null;
      clearTake?.();
      clearTake = null;
      stopTracks(stream);
      stream = null;
      recorder = null;
      setState({ phase: "idle" });
    },
    cancelRequest() {
      if (disposed || state.phase !== "requesting") return;
      // getUserMedia cannot be aborted. A late permission grant is closed in start().
      operation += 1;
      setState({ phase: "idle" });
    },
    dispose() {
      disposed = true;
      operation += 1;
      uploadAbort?.abort();
      pendingTake = null;
      clearTake?.();
      clearTake = null;
      stopTracks(stream);
      stream = null;
      recorder = null;
    },
  };
}
