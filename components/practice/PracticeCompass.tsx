import { Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { ContextAction } from "@/components/ui/ContextAction";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";
import type { LearningContract } from "@/lib/schema";

export function PracticeCompass({
  contract,
  onAsk,
}: {
  contract: LearningContract;
  onAsk: (label: string, value: string) => void;
}) {
  const fields = [
    ["Listen for", contract.listenFor],
    ["Try", contract.tryCue],
    ...(contract.avoid ? [["Avoid", contract.avoid]] : []),
    ["Strength", contract.strength ?? "We are still finding today’s reliable pattern."],
    ["Ready to move on when", contract.readyWhen],
  ];
  return (
    <Surface
      as="aside"
      variant="inverse"
      position={{ lg: "sticky" }}
      top={{ lg: "5.5rem" }}
      p={{ base: 5, md: 6 }}
    >
      <Flex justify="space-between" align="center">
        <Eyebrow tone="inverse">Practice Compass</Eyebrow>
        <Text color="cream.400" fontSize="xs">
          {contract.confidence}
        </Text>
      </Flex>
      <Box mt={6} pb={5} borderBottomWidth="1px" borderColor="cream.800">
        <Text color="cream.400" fontSize="xs">
          Today’s focus
        </Text>
        <Heading mt={2} size="md" color="fg.inverse" lineHeight="1.25">
          {contract.focus}
        </Heading>
        <ContextAction inverse onClick={() => onAsk("Current focus", contract.focus)}>
          Ask about this
        </ContextAction>
      </Box>
      <Stack mt={5} gap={5}>
        {fields.map(([label, value]) => (
          <Box key={label}>
            <Text color="cream.400" fontSize="xs">
              {label}
            </Text>
            <Text mt={1} lineHeight="1.55">
              {value}
            </Text>
            <ContextAction inverse onClick={() => onAsk(label, value)}>
              Explain
            </ContextAction>
          </Box>
        ))}
      </Stack>
    </Surface>
  );
}
