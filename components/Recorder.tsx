"use client";

import { Box, Button, Flex, Progress, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { uploadRecording } from "@/lib/api";
import { blobToWav } from "@/lib/wav";

export type RecorderState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "recording" }
  | { phase: "encoding" }
  | { phase: "uploading"; fraction: number }
  | { phase: "done"; storageKey: string }
  | { phase: "error"; message: string };

export function isRecorderBusy(state: RecorderState): boolean {
  return ["requesting", "recording", "encoding", "uploading"].includes(state.phase);
}

/** Record -> WAV -> Supabase Storage. Used by calibrate, exercise and
 * free-sing; hands the storage key back once the upload lands. */
export function Recorder({
  label,
  onUploaded,
  onStateChange,
  disabled = false,
}: {
  label?: string;
  onUploaded: (storageKey: string) => void;
  onStateChange?: (state: RecorderState) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<RecorderState>({ phase: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const disposedRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      // Ending the tracks fires the recorder's stop event, so onstop must
      // know this is teardown - not a take to encode and upload.
      disposedRef.current = true;
      operationRef.current += 1;
      uploadAbortRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  useEffect(
    () => () => {
      onStateChange?.({ phase: "idle" });
    },
    [onStateChange],
  );

  const start = async () => {
    let stream: MediaStream | null = null;
    const operationId = ++operationRef.current;
    try {
      setState({ phase: "requesting" });
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current || operationId !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        streamRef.current = null;
        stream?.getTracks().forEach((track) => track.stop());
        if (disposedRef.current || operationId !== operationRef.current) return;
        try {
          setState({ phase: "encoding" });
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const wav = await blobToWav(blob);
          if (disposedRef.current || operationId !== operationRef.current) return;
          setState({ phase: "uploading", fraction: 0 });
          const uploadController = new AbortController();
          uploadAbortRef.current = uploadController;
          const key = await uploadRecording(
            wav,
            (fraction) => {
              if (!disposedRef.current && operationId === operationRef.current) {
                setState({ phase: "uploading", fraction });
              }
            },
            uploadController.signal,
          );
          uploadAbortRef.current = null;
          if (disposedRef.current || operationId !== operationRef.current) return;
          setState({ phase: "done", storageKey: key });
          onUploaded(key);
        } catch (error) {
          uploadAbortRef.current = null;
          if (disposedRef.current || operationId !== operationRef.current) return;
          setState({
            phase: "error",
            message: error instanceof Error ? error.message : "recording failed",
          });
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setState({ phase: "recording" });
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (disposedRef.current || operationId !== operationRef.current) return;
      setState({ phase: "error", message: "microphone access was denied" });
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
  };

  return (
    <Box>
      {label && (
        <Text mb={2} fontWeight="medium" color="ink.900">
          {label}
        </Text>
      )}
      <Flex align="center" gap={3} wrap="wrap">
        {state.phase === "recording" ? (
          <Button colorPalette="coral" onClick={stop}>
            ⏹ Stop
          </Button>
        ) : (
          <Button
            colorPalette="coral"
            variant="outline"
            onClick={start}
            disabled={
              disabled ||
              state.phase === "encoding" ||
              state.phase === "uploading" ||
              state.phase === "requesting"
            }
          >
            🎙 {state.phase === "done" ? "Re-record" : "Record"}
          </Button>
        )}
        {state.phase === "recording" && <Text color="coral.600">Recording…</Text>}
        {state.phase === "requesting" && (
          <Text color="cream.600">Waiting for microphone…</Text>
        )}
        {state.phase === "encoding" && <Text color="cream.600">Encoding…</Text>}
        {state.phase === "uploading" && (
          <Flex align="center" gap={2} minW="40">
            <Progress.Root value={state.fraction * 100} flex="1" size="sm" w="32">
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Text color="cream.600" fontSize="sm">
              Uploading…
            </Text>
          </Flex>
        )}
        {state.phase === "done" && <Text color="teal.600">✓ Uploaded</Text>}
        {state.phase === "error" && <Text color="coral.600">⚠️ {state.message}</Text>}
      </Flex>
    </Box>
  );
}
