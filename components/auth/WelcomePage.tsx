"use client";

import { Box, Container, Flex, Grid, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { AppFooter } from "@/components/AppFooter";
import { Surface } from "@/components/ui/Surface";

const STEPS = [
  {
    title: "Record an exercise",
    body: "Follow a pitch guide and record.",
  },
  {
    title: "Review your singing",
    body: "Get feedback with one focus to practice.",
  },
  {
    title: "Try again",
    body: "Listen back and compare your takes.",
  },
];

/** An illustration, not a recording, measurement, or promise of improvement.
 * The static paths deliberately have no scores, axes, or playback controls. */
function PracticeIllustration() {
  return (
    <Surface as="figure" variant="inverse" m={0} p={{ base: 5, md: 8 }} overflow="hidden">
      <Flex as="figcaption" align="center" gap={3}>
        <Box w="2" h="2" rounded="full" bg="coral.300" aria-hidden="true" />
        <Text fontSize="sm" fontWeight="medium">
          Illustrated pitch feedback
        </Text>
      </Flex>
      <Box color="cream.200" my={{ base: 6, md: 10 }}>
        <svg
          viewBox="0 0 480 330"
          width="100%"
          role="img"
          aria-label="Illustration of a sung pitch line following a stepped pitch guide. This is not a recording or result."
          focusable="false"
        >
          <g fill="none" stroke="currentColor" opacity="0.12">
            <circle cx="240" cy="165" r="148" />
            <circle cx="240" cy="165" r="108" />
            <path d="M20 80H460M20 165H460M20 250H460" />
          </g>
          <g
            fill="none"
            stroke="var(--chakra-colors-teal-300)"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.7"
          >
            <path d="M28 250H102M116 165H190M204 80H278M292 165H366M380 250H452" />
          </g>
          <path
            d="M28 274C42 268 41 240 56 246S78 257 96 248S111 175 131 170S160 154 181 165S198 94 221 84S241 91 253 82S276 77 285 103S291 174 313 169S336 155 357 165S370 239 395 250S423 241 452 254"
            fill="none"
            stroke="var(--chakra-colors-coral-300)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="253" cy="82" r="10" fill="var(--chakra-colors-coral-300)" />
          <circle
            cx="253"
            cy="82"
            r="21"
            fill="none"
            stroke="var(--chakra-colors-coral-300)"
            opacity="0.35"
          />
        </svg>
      </Box>
      <Flex gap={6} wrap="wrap" justify="center" fontSize="sm">
        <Flex gap={2} align="center">
          <Box w="6" h="2" rounded="full" bg="teal.300" aria-hidden="true" />
          <Text>Pitch guide</Text>
        </Flex>
        <Flex gap={2} align="center">
          <Box w="6" h="1" rounded="full" bg="coral.300" aria-hidden="true" />
          <Text>Sung pitch</Text>
        </Flex>
      </Flex>
    </Surface>
  );
}

/** Public introduction composed around the existing sign-in controls. No microphone
 * access, audio playback, or recording starts on this screen. */
export function WelcomePage({ children }: { children: React.ReactNode }) {
  return (
    <Box minH="100dvh" bg="bg.canvas" pt="env(safe-area-inset-top)">
      <Link
        href="#welcome-content"
        position="absolute"
        top="2"
        left="2"
        zIndex="skipNav"
        bg="bg.surface"
        p={3}
        transform="translateY(-200%)"
        _focus={{
          transform: "translateY(0)",
          outline: "2px solid",
          outlineColor: "border.focus",
        }}
      >
        Skip to content
      </Link>
      <Container maxW="6xl" px={{ base: 5, md: 8 }}>
        <Flex
          as="header"
          align="center"
          justify="space-between"
          gap={4}
          py={5}
          borderBottomWidth="1px"
          borderColor="border.default"
        >
          <Text fontWeight="bold" fontSize="lg" letterSpacing="tight">
            <Box as="span" color="action.primary" aria-hidden="true">
              ◉{" "}
            </Box>
            The Sing Coach
          </Text>
          <Link
            href="#start-practicing"
            color="action.primary"
            fontWeight="semibold"
            minH="44px"
            alignItems="center"
            focusVisibleRing="outside"
          >
            Sign in
          </Link>
        </Flex>
        <Box as="main" id="welcome-content" tabIndex={-1}>
          <Grid
            templateColumns={{ base: "minmax(0, 1fr)", lg: "1.1fr 1fr" }}
            gap={{ base: 8, lg: 12 }}
            alignItems="center"
            py={{ base: 9, md: 14 }}
          >
            <Stack gap={6} minW={0}>
              <Heading
                as="h1"
                fontSize={{ base: "4xl", md: "6xl" }}
                lineHeight="1.08"
                letterSpacing="-0.045em"
                maxW="15ch"
              >
                Singing practice with a clear next step.
              </Heading>
              <Text
                fontSize={{ base: "lg", md: "xl" }}
                color="fg.muted"
                lineHeight="1.65"
                maxW="43ch"
              >
                The Sing Coach combines vocal exercises, pitch analysis and AI feedback to
                help you understand your voice and guide your practice.
              </Text>
              <Box
                as="section"
                id="start-practicing"
                aria-labelledby="start-heading"
                scrollMarginTop="6"
                maxW="sm"
                mt={2}
              >
                <Stack gap={4}>
                  <Heading as="h2" id="start-heading" size="md">
                    Start practicing
                  </Heading>
                  {children}
                </Stack>
              </Box>
            </Stack>
            <PracticeIllustration />
          </Grid>
          <Box as="section" aria-label="How practice works" pb={{ base: 9, md: 12 }}>
            <Grid
              as="ol"
              listStyleType="none"
              m={0}
              p={0}
              templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(3, 1fr)" }}
              gap={4}
            >
              {STEPS.map((step, index) => (
                <Surface as="li" key={step.title} p={{ base: 5, md: 6 }}>
                  <Flex align="center" gap={3} mb={3}>
                    <Flex
                      aria-hidden="true"
                      align="center"
                      justify="center"
                      w="10"
                      h="10"
                      flexShrink={0}
                      rounded="full"
                      bg="singer.surface"
                      color="action.secondary"
                      fontWeight="semibold"
                    >
                      {index + 1}
                    </Flex>
                    <Heading as="h2" size="lg">
                      {step.title}
                    </Heading>
                  </Flex>
                  <Text color="fg.muted" lineHeight="1.7">
                    {step.body}
                  </Text>
                </Surface>
              ))}
            </Grid>
          </Box>
          <Grid
            templateColumns={{ base: "minmax(0, 1fr)", md: "1fr 1fr" }}
            gap={{ base: 7, md: 12 }}
            borderTopWidth="1px"
            borderColor="border.default"
            py={8}
          >
            <Stack gap={3}>
              <Heading as="h2" size="md">
                Your recordings
              </Heading>
              <Text color="fg.muted" fontSize="sm" lineHeight="1.7">
                Recordings are stored privately in your account and processed to measure
                your singing. The AI coach receives measurements and messages, not audio.
              </Text>
              <Link
                href="/privacy"
                color="action.secondary"
                textDecoration="underline"
                alignSelf="start"
                minH="44px"
                focusVisibleRing="outside"
              >
                Read the privacy policy
              </Link>
            </Stack>
            <Stack gap={3}>
              <Heading as="h2" size="md">
                Practicing comfortably
              </Heading>
              <Text color="fg.muted" fontSize="sm" lineHeight="1.7">
                AI feedback can be wrong, especially while learning your baseline. It
                cannot replace a voice teacher or medical advice. Stop if singing hurts.
              </Text>
            </Stack>
          </Grid>
        </Box>
      </Container>
      <AppFooter />
    </Box>
  );
}
