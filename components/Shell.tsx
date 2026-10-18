"use client";

import { Box, Container, Flex, Heading, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AppFooter } from "@/components/AppFooter";
import { AuthGate } from "@/components/AuthGate";
import { MobileTabBar } from "@/components/MobileTabBar";

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
      <Box
        minH="100dvh"
        bg="bg.canvas"
        display="flex"
        flexDirection="column"
        pb={{
          base: "calc(var(--chakra-sizes-mobile-nav) + env(safe-area-inset-bottom))",
          md: "0",
        }}
      >
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
          display={{ base: "none", md: "block" }}
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
        <Box
          bg="bg.overlay"
          backdropFilter="blur(14px)"
          borderBottomWidth="1px"
          borderColor="border.default"
          position="sticky"
          top="0"
          zIndex="sticky"
          display={{ base: "block", md: "none" }}
          pt="env(safe-area-inset-top)"
        >
          <Container py={3}>
            <Heading size="md" color="ink.900" letterSpacing="-0.025em">
              <Box as="span" color="coral.600">
                ◉
              </Box>{" "}
              Singing Coach
            </Heading>
          </Container>
        </Box>
        <Container
          as="main"
          id="main-content"
          maxW="6xl"
          flex="1"
          py={{ base: 6, md: 9 }}
        >
          {children}
        </Container>
        <AppFooter />
        <MobileTabBar currentPath={pathname} />
      </Box>
    </AuthGate>
  );
}
