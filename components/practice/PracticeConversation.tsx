import { Box, Text } from "@chakra-ui/react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { PracticeMessageRow } from "@/lib/practice";
import type { ContextAnchor } from "@/lib/schema";

export function PracticeMessage({ message }: { message: PracticeMessageRow }) {
  if (!message.content_json?.text) return null;

  return (
    <Surface
      variant={message.role === "user" ? "subtle" : "base"}
      ml={message.role === "user" ? { base: 5, md: 16 } : 0}
      mr={message.role === "assistant" ? { base: 3, md: 10 } : 0}
      bg={message.role === "user" ? "singer.surface" : "bg.surface"}
      borderLeftWidth={message.context_anchor_json ? "3px" : "1px"}
      borderLeftColor={message.context_anchor_json ? "singer.agency" : "border.default"}
      px={4}
      py={3}
    >
      {message.context_anchor_json ? (
        <Eyebrow tone="agency">About {message.context_anchor_json.label}</Eyebrow>
      ) : null}
      <Text mt={message.context_anchor_json ? 1 : 0} lineHeight="1.7">
        {message.content_json.text}
      </Text>
    </Surface>
  );
}

export function StreamingPracticeMessage({
  text,
  anchor,
}: {
  text: string;
  anchor: ContextAnchor | null;
}) {
  if (!text) return null;

  return (
    <Surface mr={{ base: 3, md: 10 }} px={4} py={3} aria-label="Coach is responding">
      {anchor ? <Eyebrow tone="agency">About {anchor.label}</Eyebrow> : null}
      <Text mt={anchor ? 1 : 0} lineHeight="1.7">
        {text}
        <Box
          as="span"
          aria-hidden="true"
          display="inline-block"
          w="2px"
          h="1em"
          bg="action.primary"
          ml="1"
          verticalAlign="middle"
        />
      </Text>
    </Surface>
  );
}
