import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type RecordingOptions,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import {
  renderTimedSequenceWavBytes,
  type TimedToneEvent,
} from "../../../lib/referenceTone";
import { RecordingSession, type Snapshot } from "./RecordingSession";
import { assertMonoPcmWav } from "./wav";

// AVAudioRecorder writes lossless mono PCM directly; no client DSP, filters or resampling.
// 48 kHz is the requested capture format, not a claim about every hardware route.
export const PCM_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 48_000,
  numberOfChannels: 1,
  bitRate: 768_000,
  directory: "cache",
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: { outputFormat: "default", audioEncoder: "default" },
  web: {},
};
const mode = (allowsRecording: boolean) =>
  setAudioModeAsync({
    allowsRecording,
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
    shouldRouteThroughEarpiece: false,
  });
function remove(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* OS may already have evicted cache. */
  }
}

/** Local-only audio. Caller must explicitly upload take.uri, then releaseTake after acknowledgement. */
export function useNativeAudio(maxDurationMs = 60_000) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    state: "ready",
    take: null,
    error: null,
    elapsedMs: 0,
  });
  const [playing, setPlaying] = useState<"reference" | "take" | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const guideUri = useRef<string | null>(null);
  const playbackGeneration = useRef(0);
  const mounted = useRef(false);
  const stopPlayback = () => {
    ++playbackGeneration.current;
    if (player.current) {
      player.current.pause();
      player.current.remove();
      player.current = null;
    }
    if (guideUri.current) {
      remove(guideUri.current);
      guideUri.current = null;
    }
    if (mounted.current) setPlaying(null);
  };
  useEffect(() => {
    mounted.current = true;
    const session = new RecordingSession(
      {
        permission: async () => {
          if (Platform.OS !== "ios")
            throw new Error("This recording beta supports iOS only.");
          return (await requestRecordingPermissionsAsync()).granted;
        },
        recordingMode: () => mode(true),
        playbackMode: () => mode(false),
        stopPlayback,
        deleteFile: remove,
        validateTake: async (uri) => assertMonoPcmWav(await new File(uri).bytes()),
        createRecorder: () => {
          // Constructor receives native flattened options; prepare receives public platform options.
          const recorder = new AudioModule.AudioRecorder({
            ...PCM_OPTIONS,
            ...PCM_OPTIONS.ios,
          });
          let poll: ReturnType<typeof setInterval> | null = null;
          let input: string | null = null;
          let checking = false;
          let stopped = false;
          return {
            prepare: async () => {
              await recorder.prepareToRecordAsync(PCM_OPTIONS);
              input = (await recorder.getCurrentInput()).uid;
            },
            start: () => {
              recorder.record({ forDuration: maxDurationMs / 1000 });
              poll = setInterval(async () => {
                if (checking) return;
                checking = true;
                try {
                  const status = recorder.getStatus();
                  const route = await recorder.getCurrentInput();
                  if (stopped) return;
                  if (
                    !status.isRecording ||
                    status.mediaServicesDidReset ||
                    route.uid !== input
                  )
                    session.interrupt();
                } catch {
                  if (!stopped) session.interrupt();
                } finally {
                  checking = false;
                }
              }, 400);
            },
            stop: async () => {
              stopped = true;
              if (poll) clearInterval(poll);
              poll = null;
              await recorder.stop();
            },
            uri: () => recorder.uri,
            release: () => {
              stopped = true;
              if (poll) clearInterval(poll);
              recorder.release();
            },
          };
        },
      },
      setSnapshot,
      maxDurationMs,
    );
    sessionRef.current = session;
    const subscription = AppState.addEventListener("change", (state) => {
      session.handleAppState(state);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopPlayback();
      session.dispose();
      sessionRef.current = null;
    };
  }, [maxDurationMs]);

  const play = async (kind: "reference" | "take", events?: TimedToneEvent[]) => {
    const session = sessionRef.current;
    if (!session || !["ready", "review", "error"].includes(session.snapshot.state))
      return;
    stopPlayback();
    const generation = playbackGeneration.current;
    setPlaybackError(null);
    try {
      await mode(false);
      if (!mounted.current || generation !== playbackGeneration.current) return;
      let uri = session.snapshot.take?.uri;
      if (kind === "reference") {
        if (!events) return;
        const file = new File(Paths.cache, `pitch-guide-${Date.now()}.wav`);
        file.create();
        guideUri.current = file.uri;
        file.write(renderTimedSequenceWavBytes(events));
        uri = file.uri;
      }
      if (!uri) return;
      const instance = createAudioPlayer(uri);
      player.current = instance;
      instance.addListener("playbackStatusUpdate", (status) => {
        if (generation !== playbackGeneration.current) return;
        if (status.didJustFinish) stopPlayback();
      });
      instance.play();
      setPlaying(kind);
    } catch {
      stopPlayback();
      if (mounted.current)
        setPlaybackError("Audio could not play. You can still record a take.");
    }
  };
  return {
    ...snapshot,
    playing,
    playbackError,
    start: () => sessionRef.current?.start(),
    stop: () => sessionRef.current?.stop(),
    discard: () => sessionRef.current?.discard(),
    cancel: () => sessionRef.current?.discard(),
    releaseTake: () => sessionRef.current?.discard(),
    playReference: (events: TimedToneEvent[]) => play("reference", events),
    playTake: () => play("take"),
    stopPlayback,
  };
}
