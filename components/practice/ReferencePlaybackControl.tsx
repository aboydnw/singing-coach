import { Button, Stack, Text } from "@chakra-ui/react";

export type ReferencePlaybackState = "ready" | "preparing" | "playing" | "error";

export function ReferencePlaybackControl({
  state,
  referenceFallback,
  disabled,
  onPlay,
  onStop,
}: {
  state: ReferencePlaybackState;
  referenceFallback: boolean;
  disabled: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  return (
    <Stack gap={2} alignItems="start">
      {state === "playing" ? (
        <Button variant="outline" colorPalette="teal" onClick={onStop}>
          Stop reference
        </Button>
      ) : (
        <Button
          variant="outline"
          colorPalette="teal"
          onClick={onPlay}
          disabled={disabled || state === "preparing"}
        >
          {state === "error"
            ? "Retry"
            : state === "preparing"
              ? "Preparing sound…"
              : "Hear reference"}
        </Button>
      )}
      {state === "preparing" ? (
        <Text role="status" color="fg.muted" fontSize="sm">
          Preparing sound…
        </Text>
      ) : null}
      {state === "playing" ? (
        <Text role="status" color="singer.agency" fontSize="sm">
          {referenceFallback
            ? "Vocal example unavailable—playing pitch guide"
            : "Playing reference…"}
        </Text>
      ) : null}
      {state === "error" ? (
        <Text role="alert" color="feedback.danger" fontSize="sm">
          Reference sound couldn’t play. You can retry or record without it.
        </Text>
      ) : null}
    </Stack>
  );
}
