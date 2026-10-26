import { Box, Flex, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import * as React from "react";

const DESTINATIONS = [
  { href: "/practice", label: "Practice", icon: PracticeIcon },
  { href: "/calibrate", label: "Calibrate", icon: CalibrateIcon },
  { href: "/progress", label: "Progress", icon: ProgressIcon },
  { href: "/account", label: "Account", icon: AccountIcon },
] as const;

export function isActiveDestination(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <Flex as="nav" aria-label="Primary navigation" gap={5} align="center">
      {DESTINATIONS.map((destination) => {
        const active = isActiveDestination(pathname, destination.href);
        return (
          <ChakraLink
            key={destination.href}
            asChild
            minH="12"
            display="inline-flex"
            alignItems="center"
            fontWeight={active ? "semibold" : "medium"}
            color={active ? "coral.600" : "cream.700"}
            borderBottomWidth="2px"
            borderColor={active ? "coral.500" : "transparent"}
            _hover={{ color: "coral.600", textDecoration: "none" }}
          >
            <NextLink href={destination.href} aria-current={active ? "page" : undefined}>
              {destination.label}
            </NextLink>
          </ChakraLink>
        );
      })}
    </Flex>
  );
}

export function MobileNavigation({ pathname }: { pathname: string }) {
  return (
    <Box
      as="nav"
      aria-label="Primary navigation"
      display={{ base: "grid", md: "none" }}
      gridTemplateColumns="repeat(4, minmax(0, 1fr))"
      position="fixed"
      insetInline="0"
      bottom="0"
      zIndex="sticky"
      minH="var(--mobile-nav-height)"
      pb="env(safe-area-inset-bottom)"
      bg="bg.overlay"
      backdropFilter="blur(16px)"
      borderTopWidth="1px"
      borderColor="border.default"
      boxShadow="overlay"
    >
      {DESTINATIONS.map((destination) => {
        const active = isActiveDestination(pathname, destination.href);
        const Icon = destination.icon;
        return (
          <ChakraLink
            key={destination.href}
            asChild
            minH="4.25rem"
            color={active ? "coral.600" : "cream.700"}
            bg={active ? "coral.50" : "transparent"}
            _hover={{ textDecoration: "none", bg: "cream.100" }}
          >
            <NextLink href={destination.href} aria-current={active ? "page" : undefined}>
              <Flex direction="column" align="center" justify="center" gap="1" h="full">
                <Icon />
                <Text as="span" fontSize="xs" lineHeight="1" fontWeight="semibold">
                  {destination.label}
                </Text>
              </Flex>
            </NextLink>
          </ChakraLink>
        );
      })}
    </Box>
  );
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function PracticeIcon() {
  return (
    <NavIcon>
      <path
        d="M9 18V5l9-2v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15.5" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

function CalibrateIcon() {
  return (
    <NavIcon>
      <path
        d="M4 15h3l2-7 3 10 2-6 2 3h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

function ProgressIcon() {
  return (
    <NavIcon>
      <path
        d="M5 17l5-5 3 3 6-8M14 7h5v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

function AccountIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </NavIcon>
  );
}
