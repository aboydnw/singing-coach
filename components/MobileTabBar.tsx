import { Box, Grid, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";

const TABS = [
  { href: "/practice", label: "Practice", icon: PracticeIcon },
  { href: "/calibrate", label: "Calibrate", icon: CalibrateIcon },
  { href: "/progress", label: "Progress", icon: ProgressIcon },
  { href: "/account", label: "Account", icon: AccountIcon },
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
      px={3}
      pt={1.5}
      pb="max(0.5rem, env(safe-area-inset-bottom))"
    >
      <Grid
        gridTemplateColumns="repeat(4, minmax(0, 1fr))"
        gap={0.5}
        minH="mobileNav"
        maxW="30rem"
        mx="auto"
      >
        {TABS.map((tab) => {
          const active = currentPath.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <ChakraLink
              key={tab.href}
              asChild
              data-mobile-tab="true"
              flex="1"
              minW="0"
              minH="4rem"
              color={active ? "action.primary" : "fg.muted"}
              fontWeight={active ? "semibold" : "medium"}
              bg="transparent"
              rounded="inner"
              textDecoration="none"
              _hover={{ bg: "cream.50" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "border.focus" }}
              _active={{ transform: "translateY(1px)" }}
            >
              <NextLink href={tab.href} aria-current={active ? "page" : undefined}>
                <Grid
                  minH="4rem"
                  gridTemplateRows="2.25rem 1rem"
                  placeItems="center"
                  gap="0.5"
                  py={1}
                >
                  <Box
                    display="grid"
                    placeItems="center"
                    w="3rem"
                    h="2rem"
                    rounded="full"
                    bg={active ? "coral.100" : "transparent"}
                  >
                    <Icon />
                  </Box>
                  <Text as="span" fontSize="0.72rem" lineHeight="1" truncate maxW="100%">
                    {tab.label}
                  </Text>
                </Grid>
              </NextLink>
            </ChakraLink>
          );
        })}
      </Grid>
    </Box>
  );
}

const iconProps = {
  width: 21,
  height: 21,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: "false" as const,
  "aria-hidden": true,
};

function PracticeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

function CalibrateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 12h3l2.1-5 4.1 10 2.1-5H20" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 17 10 12l3 3 6-8" />
      <path d="M14 7h5v5" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.8-3.6 3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    </svg>
  );
}
