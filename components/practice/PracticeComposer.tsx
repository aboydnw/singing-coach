import { Badge, Box, Button, Flex, Textarea } from "@chakra-ui/react";
import type { ContextAnchor } from "@/lib/schema";

export function PracticeComposer(props: {
  value: string;
  onChange: (value: string) => void;
  anchor: ContextAnchor | null;
  onClearAnchor: () => void;
  onSend: () => void;
  onDifferent: () => void;
  onFreeSing: () => void;
  streaming: boolean;
  disabled: boolean;
  onStop: () => void;
}) {
  return (
    <Box
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      zIndex="sticky"
      bg="bg.overlay"
      backdropFilter="blur(16px)"
      borderTopWidth="1px"
      borderColor="border.default"
      py={3}
      pb="max(.75rem, env(safe-area-inset-bottom))"
    >
      <Box maxW="6xl" mx="auto" px={{ base: 4, md: 6 }}>
        <Box
          maxW={{ lg: "calc((100% - 1.5rem) * .71)" }}
          bg="bg.surface"
          borderWidth="1px"
          borderColor={props.anchor ? "singer.agency" : "border.default"}
          rounded="surface"
          px={3}
          py={2}
          boxShadow="overlay"
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
                  : "Ask about an exercise or something the coach said"
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
          <Flex gap={4} mt={1} wrap="wrap">
            <Button
              size="xs"
              variant="plain"
              px={0}
              color="fg.muted"
              onClick={props.onDifferent}
              disabled={props.disabled}
            >
              Different exercise
            </Button>
            <Button
              size="xs"
              variant="plain"
              px={0}
              color="fg.muted"
              onClick={props.onFreeSing}
              disabled={props.disabled}
            >
              Free sing
            </Button>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}
