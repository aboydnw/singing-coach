"use client";

import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import type { AttemptJobRow } from "@/lib/attemptJobs";
import { pendingGuidance } from "@/lib/attemptJobs";
import type { LearningContract } from "@/lib/schema";
import { Surface } from "@/components/ui/Surface";

const STAGES: Record<AttemptJobRow["status"], { title: string; detail: string }> = {
  queued: {
    title: "Recording uploaded",
    detail: "Your recording is safe. You can leave this page—we’ll keep working.",
  },
  analyzing: {
    title: "Listening to your take",
    detail: "We’re measuring the notes and steadiness. You can leave this page.",
  },
  coaching: {
    title: "Preparing your coaching",
    detail: "Your analysis is saved while the coach prepares one useful next step.",
  },
  completed: {
    title: "Coaching ready",
    detail: "Your completed attempt will appear here in a moment.",
  },
  failed: {
    title: "This attempt needs another try",
    detail: "Your uploaded recording is still safe.",
  },
};

export function PendingAttempt({
  job,
  contract,
  onRetry,
}: {
  job: AttemptJobRow;
  contract: LearningContract | null;
  onRetry: () => void;
}) {
  const stage = STAGES[job.status];
  return (
    <Surface variant="raised" px={{ base: 4, md: 5 }} py={5}>
      <Stack gap={4}>
        <Box role="status" aria-live="polite">
          <Text color="singer.agency" fontWeight="semibold" fontSize="sm">
            Attempt in progress
          </Text>
          <Heading mt={1} size="lg" letterSpacing="-0.02em">
            {stage.title}
          </Heading>
          <Text mt={2} color="fg.muted">
            {job.status === "failed" && job.error_message
              ? job.error_message
              : stage.detail}
          </Text>
        </Box>
        {job.status === "failed" ? (
          <Button colorPalette="coral" alignSelf="start" onClick={onRetry}>
            Retry processing
          </Button>
        ) : (
          <Box bg="bg.subtle" rounded="inner" px={4} py={3}>
            <Text fontWeight="semibold">While you wait</Text>
            <Text mt={1} color="fg.muted" lineHeight="1.65">
              {pendingGuidance(job, contract)}
            </Text>
          </Box>
        )}
      </Stack>
    </Surface>
  );
}
