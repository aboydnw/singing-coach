"use client";

import { Box, Button } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useConversationLiveEdge } from "@/components/practice/useConversationLiveEdge";

export function PracticeConversationViewport({
  children,
  itemCount,
  exerciseId,
}: {
  children: ReactNode;
  itemCount: number;
  exerciseId: string | null;
}) {
  const { state, sentinelRef, jump } = useConversationLiveEdge(itemCount, exerciseId);
  return (
    <Box position="relative" pb={{ base: "var(--practice-dock-height, 0px)", md: 0 }}>
      {children}
      <Box ref={sentinelRef} h="1px" aria-hidden="true" />
      {!state.following ? (
        <Button
          size="sm"
          position="fixed"
          right="4"
          bottom="calc(var(--mobile-nav-height, 0px) + var(--practice-dock-height, 0px) + 1rem)"
          zIndex="sticky"
          colorPalette="teal"
          onClick={jump}
          aria-label={
            state.unseen
              ? `${state.unseen} new updates. Jump to latest`
              : "Jump to latest"
          }
        >
          Jump to latest
        </Button>
      ) : null}
    </Box>
  );
}
