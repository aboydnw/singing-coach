import { Badge, Box, Button, Flex, Stack, Textarea } from "@chakra-ui/react";
import type { ContextAnchor } from "@/lib/schema";

export function PracticeComposer(props: {
  value: string;
  onChange: (value: string) => void;
  anchor: ContextAnchor | null;
  onClearAnchor: () => void;
  onSend: () => void;
  onRetry: () => void;
  onDifferent: () => void;
  streaming: boolean;
  disabled: boolean;
  onStop: () => void;
}) {
  return (
    <Stack gap={3}>
      <Box
        bg="bg.surface"
        borderWidth="1px"
        borderColor={props.anchor ? "singer.agency" : "border.default"}
        rounded="surface"
        px={3}
        py={2}
        boxShadow="surface"
      >
        {props.anchor ? (
          <Flex gap={2} align="center" mb={2}>
            <Badge colorPalette="teal" variant="subtle">
              Asking about: {props.anchor.label}
            </Badge>
            <Button size="xs" variant="plain" onClick={props.onClearAnchor}>
              Remove
            </Button>
          </Flex>
        ) : null}
        <Flex gap={2} align="end">
          <Textarea
            id="practice-question"
            autoresize
            variant="flushed"
            placeholder={
              props.disabled
                ? "Finish this attempt before asking the coach"
                : "Ask about this exercise or the coach’s feedback"
            }
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            disabled={props.disabled || props.streaming}
            minH="10"
            maxH="28"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onSend();
              }
            }}
          />
          {props.streaming ? (
            <Button variant="outline" colorPalette="coral" onClick={props.onStop}>
              Stop
            </Button>
          ) : (
            <Button
              colorPalette="coral"
              onClick={props.onSend}
              disabled={!props.value.trim() || props.disabled}
            >
              Send
            </Button>
          )}
        </Flex>
      </Box>
      <Flex gap={3} wrap="wrap">
        <Button
          variant="outline"
          colorPalette="coral"
          onClick={props.onRetry}
          disabled={props.disabled || props.streaming}
        >
          Try again
        </Button>
        <Button
          variant="plain"
          color="fg.muted"
          onClick={props.onDifferent}
          disabled={props.disabled || props.streaming}
        >
          Try a different exercise
        </Button>
      </Flex>
    </Stack>
  );
}
