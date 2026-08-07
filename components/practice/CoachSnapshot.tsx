"use client";

import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { PracticeSessionRow } from "@/lib/practice";

export function CoachSnapshot({ latest }: { latest: PracticeSessionRow | null }) {
  const router = useRouter();
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
      <Stack mt={6} gap={6}>
        <Box>
          <Text color="cream.400" fontSize="xs">
            Current focus
          </Text>
          <Text mt={1} fontSize="lg" fontWeight="medium">
            {contract?.focus ?? "Learning your baseline"}
          </Text>
        </Box>
        <Box>
          <Text color="cream.400" fontSize="xs">
            Strength
          </Text>
          <Text mt={1}>
            {contract?.strength ??
              "Your first practices will give us something specific to build on."}
          </Text>
        </Box>
        <Button
          variant="plain"
          color="coral.200"
          justifyContent="start"
          px={0}
          onClick={() => router.push("/progress")}
        >
          See the evidence →
        </Button>
      </Stack>
    </Surface>
  );
}
