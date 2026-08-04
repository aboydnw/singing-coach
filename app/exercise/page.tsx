"use client";

import { Heading, Stack } from "@chakra-ui/react";
import { ExerciseFlow } from "@/components/ExerciseFlow";
import { Shell } from "@/components/Shell";

export default function ExercisePage() {
  return (
    <Shell>
      <Stack gap={5}>
        <Heading size="lg" color="ink.900">
          Exercise
        </Heading>
        <ExerciseFlow />
      </Stack>
    </Shell>
  );
}
