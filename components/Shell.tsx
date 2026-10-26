"use client";

import { Box, Container, Flex, Heading, Link as ChakraLink } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import { DesktopNavigation, MobileNavigation } from "@/components/AppNavigation";
import { AppFooter } from "@/components/AppFooter";
import { AuthGate } from "@/components/AuthGate";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGate>
      <Box
        minH="100dvh"
        bg="bg.canvas"
        display="flex"
        flexDirection="column"
        style={
          {
            "--mobile-nav-height": "calc(4.25rem + env(safe-area-inset-bottom))",
          } as React.CSSProperties
        }
        pb={{ base: "var(--mobile-nav-height)", md: "0" }}
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
        >
          <Container maxW="6xl" py={3}>
            <Flex align="center" justify="space-between" gap={6}>
              <Heading size="md" color="ink.900" letterSpacing="-0.025em">
                <Box as="span" color="coral.600">
                  ◉
                </Box>{" "}
                Singing Coach
              </Heading>
              <Box display={{ base: "none", md: "block" }}>
                <DesktopNavigation pathname={pathname} />
              </Box>
            </Flex>
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
        <MobileNavigation pathname={pathname} />
      </Box>
    </AuthGate>
  );
}
