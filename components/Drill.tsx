"use client";

import { Badge, Box, Button, Heading, List, Stack, Text } from "@chakra-ui/react";
import type { ResolvedCoachingPayload } from "@/lib/schema";

/** The canonical drill, resolved from prompts/pedagogy.json rather than written
 * by the model. The coach's own words introduce it; this is the technique. */
export function Drill({
  resolved,
  onPractice,
}: {
  resolved: ResolvedCoachingPayload;
  onPractice?: (exerciseType: string) => void;
}) {
  const exerciseType = resolved.drill.exercise_type ?? null;

  return (
    <Box bg="cream.100" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
      <Stack gap={3}>
        <Stack direction="row" align="center" gap={2} wrap="wrap">
          <Heading size="sm" color="ink.900">
            {resolved.drill.name}
          </Heading>
          <Badge colorPalette="teal" variant="subtle">
            {Math.round(resolved.drill.duration_s)}s
          </Badge>
          <Badge colorPalette="gray" variant="subtle">
            {resolved.remediation_family}
          </Badge>
        </Stack>

        <Text color="ink.900">{resolved.drill.instructions}</Text>

        {resolved.cues.length > 0 && (
          <Box>
            <Text fontWeight="medium" color="ink.900" mb={1} fontSize="sm">
              While you do it
            </Text>
            <List.Root color="cream.600" fontSize="sm" gap={1}>
              {resolved.cues.map((cue) => (
                <List.Item key={cue}>{cue}</List.Item>
              ))}
            </List.Root>
          </Box>
        )}

        {resolved.caution && (
          <Text color="coral.600" fontSize="sm">
            <b>Note:</b> {resolved.caution}
          </Text>
        )}

        {exerciseType && onPractice && (
          <Button
            alignSelf="start"
            size="sm"
            variant="outline"
            colorPalette="teal"
            onClick={() => onPractice(exerciseType)}
          >
            Practice this as my next exercise
          </Button>
        )}
      </Stack>
    </Box>
  );
}
