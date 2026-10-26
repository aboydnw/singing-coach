import { Box, Button, Flex, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { WorkspaceSummary } from "@/lib/practiceWorkspace";

export function PracticeActionWorkspace({
  summary,
  exerciseName,
  children,
  onDifferent,
  onEnd,
  actionsDisabled,
}: {
  summary: WorkspaceSummary;
  exerciseName: string;
  children: ReactNode;
  onDifferent: () => void;
  onEnd: () => void;
  actionsDisabled: boolean;
}) {
  return (
    <Surface id="practice-controls" variant="raised" p={{ base: 5, md: 7 }}>
      <Stack gap={6}>
        <Box>
          <Eyebrow>Your next attempt</Eyebrow>
          <Heading id="practice-controls-heading" tabIndex={-1} mt={2} size="xl">
            {exerciseName}
          </Heading>
        </Box>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          {summary.encouragement ? (
            <Box bg="coaching.surface" rounded="inner" p={4}>
              <Eyebrow>How it is going</Eyebrow>
              <Text mt={2} lineHeight="1.6">
                {summary.encouragement}
              </Text>
            </Box>
          ) : null}
          <Box bg="singer.surface" rounded="inner" p={4}>
            <Eyebrow tone="agency">Focus on this</Eyebrow>
            <Text mt={2} fontWeight="semibold" lineHeight="1.6">
              {summary.focus}
            </Text>
          </Box>
        </SimpleGrid>
        {children}
        <Flex
          gap={3}
          wrap="wrap"
          borderTopWidth="1px"
          borderColor="border.default"
          pt={4}
        >
          <Button
            minH="12"
            variant="outline"
            onClick={onDifferent}
            disabled={actionsDisabled}
          >
            Different exercise
          </Button>
          <Button
            minH="12"
            variant="ghost"
            colorPalette="coral"
            onClick={onEnd}
            disabled={actionsDisabled}
          >
            End practice
          </Button>
        </Flex>
      </Stack>
    </Surface>
  );
}
