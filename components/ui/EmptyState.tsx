import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { Surface } from "@/components/ui/Surface";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Surface variant="subtle" as="section" px={5} py={7}>
      <Box maxW="34rem">
        <Heading size="sm">{title}</Heading>
        <Text mt={2} color="fg.muted" lineHeight="1.65">
          {children}
        </Text>
        {action ? (
          <Button mt={4} size="sm" colorPalette="coral" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </Box>
    </Surface>
  );
}
