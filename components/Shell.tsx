"use client";

import { Box, Container, Flex, Heading, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";

const TABS = [
  { href: "/practice", label: "Practice" },
  { href: "/calibrate", label: "Calibrate" },
  { href: "/progress", label: "Progress" },
  { href: "/account", label: "Account" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGate>
      <Box minH="100dvh" bg="bg.canvas">
        <ChakraLink
          href="#main-content"
          position="fixed"
          top="2"
          left="2"
          zIndex="modal"
          bg="bg.surface"
          color="fg.default"
          px={3}
          py={2}
          rounded="inner"
          transform="translateY(-200%)"
          _focus={{
            transform: "translateY(0)",
            outline: "2px solid",
            outlineColor: "border.focus",
          }}
        >
          Skip to content
        </ChakraLink>
        <Box
          bg="bg.overlay"
          backdropFilter="blur(14px)"
          borderBottomWidth="1px"
          borderColor="border.default"
          position="sticky"
          top="0"
          zIndex="sticky"
        >
          <Container maxW="6xl" py={3}>
            <Flex align="center" justify="space-between" gap={6} wrap="wrap">
              <Heading size="md" color="ink.900" letterSpacing="-0.025em">
                <Box as="span" color="coral.600">
                  ◉
                </Box>{" "}
                Singing Coach
              </Heading>
              <Flex gap={4} wrap="wrap">
                {TABS.map((tab) => (
                  <ChakraLink
                    key={tab.href}
                    asChild
                    fontWeight={pathname.startsWith(tab.href) ? "semibold" : "medium"}
                    color={pathname.startsWith(tab.href) ? "coral.600" : "cream.700"}
                    textUnderlineOffset="6px"
                    textDecoration={pathname.startsWith(tab.href) ? "underline" : "none"}
                  >
                    <NextLink href={tab.href}>{tab.label}</NextLink>
                  </ChakraLink>
                ))}
              </Flex>
            </Flex>
          </Container>
        </Box>
        <Container as="main" id="main-content" maxW="6xl" py={{ base: 6, md: 9 }}>
          {children}
        </Container>
      </Box>
    </AuthGate>
  );
}
