"use client";

import { Box, Container, Flex, Grid, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { AppFooter } from "@/components/AppFooter";
import { Surface } from "@/components/ui/Surface";

const STEPS = [
  {
    title: "Listen, then give it a try",
    body: "Hear a pitch guide and record a short exercise. You don’t need to read music or sound polished.",
  },
  {
    title: "Find one thing to work on",
    body: "See your pitch and get measurement-backed AI feedback, with a specific focus for your next attempt.",
  },
  {
    title: "Try again. Listen back.",
    body: "Put the feedback into practice and revisit your recordings. Compare with your own history, at your own pace.",
  },
];

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
          py={6}
          borderBottomWidth="1px"
          borderColor="border.default"
        >
          <Text fontWeight="bold" fontSize="lg" letterSpacing="tight">
            <Box as="span" color="action.primary" aria-hidden="true">
              ◉{" "}
            </Box>
            Singing Coach
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
            templateColumns={{ base: "1fr", lg: "1.2fr 1fr" }}
            gap={{ base: 8, lg: 14 }}
            alignItems="center"
            py={{ base: 10, md: 16 }}
          >
            <Stack gap={6}>
              <Text color="action.secondary" fontWeight="semibold" fontSize="sm">
                A little practice. A little more confidence.
              </Text>
              <Heading
                as="h1"
                fontSize={{ base: "4xl", md: "6xl" }}
                lineHeight="1.08"
                letterSpacing="-0.045em"
                maxW="12ch"
              >
                Your voice is worth practicing.
              </Heading>
              <Text
                fontSize={{ base: "lg", md: "xl" }}
                color="fg.muted"
                lineHeight="1.7"
                maxW="48ch"
              >
                Curious about singing, but nervous to start? Make room for a few notes, a
                little feedback, and another try. No audience required.
              </Text>
              <Link
                href="#how-it-works"
                color="action.secondary"
                fontWeight="semibold"
                alignSelf="start"
                minH="44px"
                focusVisibleRing="outside"
              >
                See how practice works ↓
              </Link>
            </Stack>
            <Surface
              as="section"
              variant="raised"
              id="start-practicing"
              aria-labelledby="start-heading"
              scrollMarginTop="6"
              p={{ base: 6, md: 8 }}
            >
              <Stack gap={5}>
                <Text color="action.secondary" fontSize="sm" fontWeight="semibold">
                  A space to find your voice
                </Text>
                <Heading as="h2" id="start-heading" size="2xl" letterSpacing="tight">
                  Start where you are.
                </Heading>
                <Text color="fg.muted" lineHeight="1.7">
                  Sign in to start a practice or pick up where you left off. Your
                  recordings and progress belong to your account.
                </Text>
                {children}
                <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                  All you need is a microphone, a quiet spot, and a willingness to try.
                  You choose when to record.
                </Text>
              </Stack>
            </Surface>
          </Grid>
          <Box
            as="section"
            id="how-it-works"
            aria-labelledby="how-heading"
            py={{ base: 8, md: 12 }}
            borderTopWidth="1px"
            borderColor="border.default"
          >
            <Text color="action.secondary" fontSize="sm" fontWeight="semibold" mb={3}>
              Small steps, not a performance
            </Text>
            <Heading as="h2" id="how-heading" size="3xl" letterSpacing="tight" mb={8}>
              One attempt at a time.
            </Heading>
            <Grid
              as="ol"
              listStyleType="none"
              m={0}
              p={0}
              templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
              gap={{ base: 7, md: 8 }}
            >
              {STEPS.map((step, index) => (
                <Stack as="li" key={step.title} gap={3}>
                  <Text
                    aria-hidden="true"
                    color="action.primary"
                    fontSize="sm"
                    fontWeight="bold"
                  >
                    0{index + 1}
                  </Text>
                  <Heading as="h3" size="lg">
                    {step.title}
                  </Heading>
                  <Text color="fg.muted" lineHeight="1.7">
                    {step.body}
                  </Text>
                </Stack>
              ))}
            </Grid>
          </Box>
          <Surface
            as="section"
            variant="inverse"
            aria-labelledby="expect-heading"
            p={{ base: 6, md: 9 }}
            my={8}
          >
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={8}>
              <Stack gap={3}>
                <Heading as="h2" id="expect-heading" size="xl">
                  Practice without an audience.
                </Heading>
                <Text lineHeight="1.7">
                  Recordings are stored privately in your account for playback and
                  processed to measure your singing. The AI coach receives measurements
                  and coaching messages, not your audio.
                </Text>
                <Link
                  href="/privacy"
                  color="fg.inverse"
                  textDecoration="underline"
                  alignSelf="start"
                  minH="44px"
                  focusVisibleRing="outside"
                >
                  Read the privacy policy
                </Link>
              </Stack>
              <Stack gap={3}>
                <Heading as="h2" size="xl">
                  Guidance, not a verdict.
                </Heading>
                <Text lineHeight="1.7">
                  The coach is still learning your baseline in your early sessions. AI
                  feedback can be imperfect, and this isn’t a substitute for a voice
                  teacher or medical advice. Keep it comfortable and stop if singing
                  hurts.
                </Text>
              </Stack>
            </Grid>
          </Surface>
        </Box>
      </Container>
      <AppFooter />
    </Box>
  );
}
