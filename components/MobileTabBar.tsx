import { Box, Flex, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";

const TABS = [
  { href: "/practice", label: "Practice", symbol: "♪" },
  { href: "/calibrate", label: "Calibrate", symbol: "⌁" },
  { href: "/progress", label: "Progress", symbol: "↗" },
  { href: "/account", label: "Account", symbol: "○" },
] as const;

export function MobileTabBar({ currentPath }: { currentPath: string }) {
  return (
    <Box
      as="nav"
      aria-label="Primary navigation"
      display={{ base: "block", md: "none" }}
      position="fixed"
      insetInline="0"
      bottom="0"
      zIndex="sticky"
      bg="bg.overlay"
      backdropFilter="blur(14px)"
      borderTopWidth="1px"
      borderColor="border.default"
      boxShadow="overlay"
      pb="env(safe-area-inset-bottom)"
    >
      <Flex minH="mobileNav">
        {TABS.map((tab) => {
          const active = currentPath.startsWith(tab.href);
          return (
            <ChakraLink
              key={tab.href}
              asChild
              flex="1"
              minW="0"
              minH="11"
              position="relative"
              color={active ? "action.primary" : "fg.muted"}
              fontWeight={active ? "semibold" : "medium"}
              textDecoration="none"
              _active={{ transform: "translateY(1px)" }}
            >
              <NextLink href={tab.href} aria-current={active ? "page" : undefined}>
                {active ? (
                  <Box
                    data-active-marker
                    aria-hidden="true"
                    position="absolute"
                    top="0"
                    insetInline="4"
                    h="0.75"
                    bg="action.primary"
                    roundedBottom="full"
                  />
                ) : null}
                <Flex
                  minH="11"
                  direction="column"
                  align="center"
                  justify="center"
                  gap="0.5"
                >
                  <Text as="span" aria-hidden="true" fontSize="lg" lineHeight="1">
                    {tab.symbol}
                  </Text>
                  <Text as="span" fontSize="xs" lineHeight="1">
                    {tab.label}
                  </Text>
                </Flex>
              </NextLink>
            </ChakraLink>
          );
        })}
      </Flex>
    </Box>
  );
}
