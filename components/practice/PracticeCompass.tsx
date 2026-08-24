import { Box, Stack, Text } from "@chakra-ui/react";
import { ContextAction } from "@/components/ui/ContextAction";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import { compassForContract } from "@/lib/practice";
import type { LearningContract } from "@/lib/schema";

export function practiceCompassFields(contract: LearningContract) {
  const compass = compassForContract(contract);
  return [
    { label: "Overall trend", value: compass.overallTrend },
    { label: "This session", value: compass.currentSession },
    { label: "Next direction", value: compass.nextDirection },
  ];
}

export function PracticeCompass({
  contract,
  canAsk = true,
  onAsk,
}: {
  contract: LearningContract;
  canAsk?: boolean;
  onAsk: (label: string, value: string) => void;
}) {
  const fields = practiceCompassFields(contract);
  return (
    <Surface
      as="aside"
      variant="inverse"
      position={{ lg: "sticky" }}
      top={{ lg: "5.5rem" }}
      p={{ base: 5, md: 6 }}
    >
      <Eyebrow tone="inverse">Practice Compass</Eyebrow>
      <Stack mt={5} gap={4}>
        {fields.map((field) => (
          <Box key={field.label}>
            <Text color="cream.400" fontSize="xs">
              {field.label}
            </Text>
            <Text mt={1} lineHeight="1.5">
              {field.value}
            </Text>
            {canAsk ? (
              <ContextAction inverse onClick={() => onAsk(field.label, field.value)}>
                Explain
              </ContextAction>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Surface>
  );
}
