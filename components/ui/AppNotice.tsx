import { Box, Button, Flex, Text } from "@chakra-ui/react";

export type AppNoticeTone = "info" | "success" | "warning" | "danger" | "partial";

const TONES: Record<
  AppNoticeTone,
  { surface: string; border: string; text: string; symbol: string }
> = {
  info: {
    surface: "bg.subtle",
    border: "border.default",
    text: "fg.default",
    symbol: "i",
  },
  success: {
    surface: "feedback.successSurface",
    border: "teal.300",
    text: "feedback.success",
    symbol: "✓",
  },
  warning: {
    surface: "coaching.surface",
    border: "coral.300",
    text: "coaching.focus",
    symbol: "!",
  },
  danger: {
    surface: "feedback.dangerSurface",
    border: "coral.500",
    text: "feedback.danger",
    symbol: "!",
  },
  partial: {
    surface: "bg.surface",
    border: "coral.300",
    text: "feedback.danger",
    symbol: "!",
  },
};

export function AppNotice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: AppNoticeTone;
  title: string;
  children?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const style = TONES[tone];
  return (
    <Box
      role={tone === "danger" ? "alert" : "status"}
      bg={style.surface}
      borderLeftWidth="3px"
      borderColor={style.border}
      rounded="inner"
      px={4}
      py={3}
    >
      <Flex gap={3} align="start">
        <Flex
          aria-hidden="true"
          align="center"
          justify="center"
          flex="0 0 auto"
          w="1.4rem"
          h="1.4rem"
          rounded="full"
          borderWidth="1px"
          borderColor={style.border}
          color={style.text}
          fontSize="xs"
          fontWeight="bold"
        >
          {style.symbol}
        </Flex>
        <Box minW="0">
          <Text color={style.text} fontWeight="semibold">
            {title}
          </Text>
          {children ? (
            <Text mt={1} color="fg.muted" fontSize="sm" lineHeight="1.6">
              {children}
            </Text>
          ) : null}
          {action ? (
            <Button
              mt={2}
              size="xs"
              variant="outline"
              colorPalette="coral"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : null}
        </Box>
      </Flex>
    </Box>
  );
}
