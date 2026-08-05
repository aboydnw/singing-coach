"use client";

import { Box, Container, Flex, Heading, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";

const TABS = [
  { href: "/calibrate", label: "Calibrate" },
  { href: "/exercise", label: "Exercise" },
  { href: "/free-sing", label: "Free sing" },
  { href: "/progress", label: "Progress" },
  { href: "/account", label: "Account" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGate>
      <Box minH="100vh" bg="cream.100">
        <Box bg="panel" borderBottomWidth="1px" borderColor="grid">
          <Container maxW="4xl" py={3}>
            <Flex align="center" gap={6} wrap="wrap">
              <Heading size="md" color="coral.600">
                🎤 Singing Coach
              </Heading>
              <Flex gap={4} wrap="wrap">
                {TABS.map((tab) => (
                  <ChakraLink
                    key={tab.href}
                    asChild
                    fontWeight={pathname === tab.href ? "bold" : "normal"}
                    color={pathname === tab.href ? "coral.600" : "ink.900"}
                  >
                    <NextLink href={tab.href}>{tab.label}</NextLink>
                  </ChakraLink>
                ))}
              </Flex>
            </Flex>
          </Container>
        </Box>
        <Container maxW="4xl" py={6}>
          {children}
        </Container>
      </Box>
    </AuthGate>
  );
}
