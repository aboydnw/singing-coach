"use client";

import { Box, Button, Flex, Progress, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { AppNotice } from "@/components/ui/AppNotice";
import { uploadRecording } from "@/lib/api";
import { createRecorderController, type RecorderState } from "@/lib/recorder";
import { blobToWav } from "@/lib/wav";

export { isRecorderBusy, type RecorderState } from "@/lib/recorder";

/** Record -> native-rate WAV -> private storage; durable processing is owned by the parent. */
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
  const controllerRef = useRef<ReturnType<typeof createRecorderController> | null>(null);
  const uploadedRef = useRef(onUploaded);
  uploadedRef.current = onUploaded;

  useEffect(() => {
    const controller = createRecorderController({
      getUserMedia: () => {
        if (!window.isSecureContext) {
          throw new DOMException("Secure context required", "SecurityError");
        }
        if (
          !navigator.mediaDevices?.getUserMedia ||
          typeof MediaRecorder === "undefined"
        ) {
          throw new DOMException("Recording unavailable", "NotSupportedError");
        }
        return navigator.mediaDevices.getUserMedia({ audio: true });
      },
      createRecorder: (stream) => new MediaRecorder(stream),
      encode: blobToWav,
      upload: uploadRecording,
      onState: setState,
      onUploaded: (key) => uploadedRef.current(key),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
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

  return (
    <RecorderControls
      label={label}
      state={state}
      disabled={disabled}
      onStart={() => {
        if (!disabled) void controllerRef.current?.start();
      }}
      onStop={() => controllerRef.current?.stop()}
      onCancelRequest={() => controllerRef.current?.cancelRequest()}
      onDiscard={() => controllerRef.current?.discard()}
      onSubmit={() => {
        if (!disabled) void controllerRef.current?.submit();
      }}
    />
  );
}

/** Presentational states are safe to preview without requesting a microphone. */
export function RecorderControls({
  label,
  state,
  disabled = false,
  onStart,
  onStop,
  onCancelRequest,
  onDiscard,
  onSubmit,
}: {
  label?: string;
  state: RecorderState;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancelRequest: () => void;
  onDiscard: () => void;
  onSubmit: () => void;
}) {
  const recordButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [requestCancelled, setRequestCancelled] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  useEffect(() => {
    if (state.phase === "idle" && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      recordButtonRef.current?.focus();
    }
    if (state.phase === "review") submitButtonRef.current?.focus();
  }, [state.phase]);

  return (
    <Box>
      {label && (
        <Text mb={2} fontWeight="medium" color="ink.900">
          {label}
        </Text>
      )}
      <Stack gap={3}>
        <Flex align="center" gap={3} wrap="wrap">
          {state.phase === "recording" ? (
            <Button minH="12" colorPalette="coral" onClick={onStop}>
              ⏹ Stop
            </Button>
          ) : state.phase === "review" ? (
            <Button
              ref={submitButtonRef}
              minH="12"
              colorPalette="coral"
              disabled={disabled}
              onClick={(event) => {
                // Stop and Send share a position. The second click of a double-click
                // on Stop must not become consent to upload when review appears.
                if (event.detail <= 1) onSubmit();
              }}
              onKeyDown={(event) => {
                // Focus moves here from Stop. Require a fresh key press to send.
                if (event.repeat) event.preventDefault();
              }}
            >
              Send for analysis
            </Button>
          ) : (
            <Button
              ref={recordButtonRef}
              minH="12"
              colorPalette="coral"
              variant="outline"
              onClick={() => {
                setRequestCancelled(false);
                setDiscarded(false);
                onStart();
              }}
              disabled={
                disabled ||
                state.phase === "encoding" ||
                state.phase === "stopping" ||
                state.phase === "uploading" ||
                state.phase === "requesting"
              }
            >
              🎙 {state.phase === "done" ? "Re-record" : "Record"}
            </Button>
          )}
          {["recording", "stopping", "review"].includes(state.phase) && (
            <Button
              minH="12"
              variant="outline"
              onClick={() => {
                restoreFocusRef.current = true;
                setDiscarded(true);
                onDiscard();
              }}
            >
              Discard take
            </Button>
          )}
          {state.phase === "requesting" && (
            <Button
              minH="12"
              variant="ghost"
              onClick={() => {
                restoreFocusRef.current = true;
                setRequestCancelled(true);
                onCancelRequest();
              }}
            >
              Cancel microphone request
            </Button>
          )}
          <Box role="status" aria-live="polite" aria-atomic="true">
            {state.phase === "idle" && discarded && (
              <Text color="fg.muted">
                Take discarded. Nothing was sent. Ready to record again.
              </Text>
            )}
            {state.phase === "idle" && requestCancelled && (
              <Text color="fg.muted">
                Microphone request cancelled. Ready when you are.
              </Text>
            )}
            {state.phase === "recording" && <Text color="coral.600">Recording…</Text>}
            {state.phase === "stopping" && (
              <Text color="fg.muted">Stopping recording…</Text>
            )}
            {state.phase === "review" && (
              <Text color="fg.muted">Take ready. Nothing sent yet.</Text>
            )}
            {state.phase === "requesting" && (
              <Text color="fg.muted">Waiting for microphone…</Text>
            )}
            {state.phase === "encoding" && <Text color="fg.muted">Preparing audio…</Text>}
            {state.phase === "uploading" && (
              <Flex align="center" gap={2} minW="40">
                <Progress.Root value={state.fraction * 100} flex="1" size="sm" w="32">
                  <Progress.Track aria-label="Recording upload">
                    <Progress.Range />
                  </Progress.Track>
                </Progress.Root>
                <Text color="fg.muted" fontSize="sm">
                  Uploading…
                </Text>
              </Flex>
            )}
            {state.phase === "done" && <Text color="teal.600">✓ Uploaded</Text>}
          </Box>
        </Flex>
        {["idle", "recording", "review"].includes(state.phase) && (
          <Text color="fg.muted" fontSize="sm" lineHeight="1.6">
            {state.phase === "review"
              ? "Send this take for analysis, or discard it and record again. Sending uploads the audio to your private recordings."
              : "Stop to review your take before sending it for analysis. You can discard it and start over."}
          </Text>
        )}
        {state.phase === "requesting" && (
          <Text color="fg.muted" fontSize="sm" lineHeight="1.6">
            Allow microphone access in your browser to begin. No prompt? Cancel, check
            this site's microphone settings, then try again.
          </Text>
        )}
        {state.phase === "error" && (
          <AppNotice tone="danger" title="Recording needs attention">
            {state.message}
          </AppNotice>
        )}
      </Stack>
    </Box>
  );
}
