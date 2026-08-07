import { Skeleton, Stack } from "@chakra-ui/react";
import { Surface } from "@/components/ui/Surface";

export function LoadingSurface({ lines = 3 }: { lines?: number }) {
  return (
    <Surface aria-label="Loading content" aria-busy="true" p={5}>
      <Stack gap={3}>
        <Skeleton height="7" maxW="55%" />
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} height="4" maxW={index === lines - 1 ? "72%" : "100%"} />
        ))}
      </Stack>
    </Surface>
  );
}
