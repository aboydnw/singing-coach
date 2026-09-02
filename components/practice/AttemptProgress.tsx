"use client";

import { Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

/** Analysis and coaching regularly take 25-45 seconds together, and a single
 * unchanging line of text reads as a frozen page for that long. Naming the
 * stage the request has reached, alongside elapsed time, is what tells the
 * singer the wait is progress rather than a hang. */
const STAGES = [
  { after: 0, label: "Listening for the pattern in your recording…" },
  { after: 8, label: "Measuring pitch, timing, and steadiness…" },
  { after: 20, label: "Writing your coaching. This one can take a little longer…" },
] as const;

export function AttemptProgress() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const stage = STAGES.reduce((current, candidate) =>
    elapsed >= candidate.after ? candidate : current,
  );

  return (
    <Flex gap={3} align="center" role="status" aria-live="polite">
      <Spinner size="sm" color="singer.agency" flex="0 0 auto" />
      <Stack gap={0} minW="0">
        <Text color="singer.agency">{stage.label}</Text>
        <Text color="fg.muted" fontSize="sm">
          {elapsed}s elapsed · stay on this page so the coach can finish
        </Text>
      </Stack>
    </Flex>
  );
}
