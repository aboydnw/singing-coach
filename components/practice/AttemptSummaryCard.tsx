import { Badge, Box, Flex, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { Surface } from "@/components/ui/Surface";
import {
  attemptExerciseName,
  attemptNavigationLabel,
  attemptOutcome,
} from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";

export function AttemptSummaryCard({
  practiceId,
  attempt,
  fallbackIndex,
}: {
  practiceId: string;
  attempt: SessionRow;
  fallbackIndex: number;
}) {
  return (
    <Surface as="article" overflow="hidden">
      <ChakraLink
        asChild
        display="block"
        px={{ base: 5, md: 6 }}
        py={5}
        minH="12"
        color="fg.default"
        _hover={{ textDecoration: "none", bg: "bg.subtle" }}
      >
        <NextLink href={`/practice/${practiceId}/attempt/${attempt.id}`}>
          <Flex justify="space-between" gap={4} align="start">
            <Box minW="0">
              <Flex gap={2} align="center" wrap="wrap">
                <Text fontSize="sm" color="fg.muted">
                  {attemptNavigationLabel(attempt, fallbackIndex)}
                </Text>
                {attempt.attempt_kind === "retry" ? (
                  <Badge variant="subtle" colorPalette="teal">
                    Retry
                  </Badge>
                ) : null}
              </Flex>
              <Text mt={1} fontWeight="semibold">
                {attemptExerciseName(attempt)}
              </Text>
              <Text mt={2} color="fg.muted" lineClamp={2}>
                {attemptOutcome(attempt)}
              </Text>
            </Box>
            <Text color="action.primary" fontWeight="semibold" flex="0 0 auto">
              Review attempt →
            </Text>
          </Flex>
        </NextLink>
      </ChakraLink>
    </Surface>
  );
}
