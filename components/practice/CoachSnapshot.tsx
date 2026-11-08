"use client";

import { Box, Button, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { CoachMarkdown } from "@/components/practice/CoachMarkdown";
import { CoachingText } from "@/components/practice/CoachingText";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { PracticeSessionRow } from "@/lib/practice";

export function CoachSnapshot({ latest }: { latest: PracticeSessionRow | null }) {
  const contract = latest?.learning_contract_json;
  return (
    <Surface
      as="aside"
      variant="inverse"
      p={{ base: 5, md: 6 }}
      position={{ lg: "sticky" }}
      top={{ lg: "5.5rem" }}
    >
      <Eyebrow tone="inverse">Coach snapshot</Eyebrow>
      <Stack mt={4} gap={4}>
        <Box>
          <Text color="cream.400" fontSize="xs">
            Current focus
          </Text>
          <Box mt={1}>
            <CoachingText
              text={contract?.focus ?? "Learning your baseline"}
              label="focus"
              inverse
            />
          </Box>
        </Box>
        {contract?.tryCue || contract?.avoid ? (
          <Box borderTopWidth="1px" borderColor="cream.700" pt={4}>
            {contract.tryCue ? (
              <Box>
                <Text color="coral.200" fontSize="xs" fontWeight="semibold">
                  Try next
                </Text>
                <Box mt={1}>
                  <CoachingText text={contract.tryCue} label="cue" inverse />
                </Box>
              </Box>
            ) : null}
            {contract.avoid ? (
              <Box mt={contract.tryCue ? 3 : 0}>
                <Text color="coral.200" fontSize="xs" fontWeight="semibold">
                  Keep in mind
                </Text>
                <Box mt={1}>
                  <CoachMarkdown>{contract.avoid}</CoachMarkdown>
                </Box>
              </Box>
            ) : null}
          </Box>
        ) : null}
        <Box>
          <Text color="cream.400" fontSize="xs">
            Strength
          </Text>
          <Box mt={1}>
            <CoachingText
              text={
                contract?.strength ??
                "Your first practices will give us something specific to build on."
              }
              label="strength"
              inverse
            />
          </Box>
        </Box>
        <Button variant="plain" color="coral.200" justifyContent="start" px={0} asChild>
          <Link href="/progress">See the evidence →</Link>
        </Button>
      </Stack>
    </Surface>
  );
}
