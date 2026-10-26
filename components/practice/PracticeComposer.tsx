import { Badge, Box, Button, Flex, Stack, Textarea } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
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
  actionsDisabled?: boolean;
  onStop: () => void;
}) {
  const dockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = dockRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        "--practice-dock-height",
        `${Math.ceil(entry.contentRect.height)}px`,
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--practice-dock-height");
    };
  }, []);
  return (
    <Stack
      ref={dockRef}
      gap={3}
      position={{ base: "sticky", md: "static" }}
      bottom={{ base: "var(--mobile-nav-height, 0px)", md: "auto" }}
      zIndex={{ base: "sticky", md: "auto" }}
      bg={{ base: "bg.overlay", md: "transparent" }}
      backdropFilter={{ base: "blur(14px)", md: "none" }}
      borderTopWidth={{ base: "1px", md: "0" }}
      borderColor="border.default"
      mx={{ base: -4, md: 0 }}
      px={{ base: 4, md: 0 }}
      pt={{ base: 3, md: 0 }}
      pb={{ base: 3, md: 0 }}
    >
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
          disabled={props.disabled || props.actionsDisabled || props.streaming}
        >
          Try again
        </Button>
        <Button
          variant="plain"
          color="fg.muted"
          onClick={props.onDifferent}
          disabled={props.disabled || props.actionsDisabled || props.streaming}
        >
          Try a different exercise
        </Button>
      </Flex>
    </Stack>
  );
}
