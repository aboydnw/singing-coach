"use client";

import { Box, Container, Heading, Link, List, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";

export const PRIVACY_CONTACT = "privacy@anthonynboyd.com";
export const PRIVACY_UPDATED = "September 23, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack as="section" gap={2}>
      <Heading as="h2" size="md" color="fg.default">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}

/** Public privacy policy, readable without signing in. */
export function PrivacyPolicy() {
  return (
    <Box minH="100vh" bg="bg.canvas" py={{ base: 8, md: 14 }}>
      <Container maxW="2xl" px={4}>
        <Stack gap={6} color="fg.muted" lineHeight="1.7">
          <Stack gap={1}>
            <Link asChild fontSize="sm" fontWeight="semibold" color="fg.muted">
              <NextLink href="/">🎤 Singing Coach</NextLink>
            </Link>
            <Heading as="h1" size="2xl" color="fg.default">
              Privacy policy
            </Heading>
            <Text fontSize="sm">Last updated {PRIVACY_UPDATED}</Text>
          </Stack>

          <Text>
            Singing Coach is a personal practice tool that listens to your singing and
            gives feedback. This page explains what it stores, who processes it, and how
            to get it deleted.
          </Text>

          <Section title="What we collect">
            <List.Root ps={5} gap={1}>
              <List.Item>
                Your email address and, if you sign in with Google, your name and profile
                picture.
              </List.Item>
              <List.Item>The recordings you make while practicing.</List.Item>
              <List.Item>
                Measurements taken from those recordings, your vocal range calibration,
                practice history, and your conversations with the coach.
              </List.Item>
              <List.Item>
                Anonymous page-view counts. These use no cookies and do not identify you.
              </List.Item>
            </List.Root>
          </Section>

          <Section title="How we use it">
            <Text>
              Only to run the app: to sign you in, analyze your singing, give coaching
              feedback, and show your progress over time. Your data is private to your
              account. We do not sell it, share it for advertising, or use it to train AI
              models.
            </Text>
          </Section>

          <Section title="Services that process your data">
            <List.Root ps={5} gap={1}>
              <List.Item>
                <b>Supabase</b> stores your account, recordings, and practice history.
                Recordings are kept in private storage that only your account can read.
              </List.Item>
              <List.Item>
                <b>Vercel</b> hosts the app, analyzes recordings, and counts page views.
              </List.Item>
              <List.Item>
                <b>OpenRouter</b> passes your measurements and messages to an AI model to
                write coaching feedback. Your recordings are not sent.
              </List.Item>
              <List.Item>
                <b>Google</b> confirms your identity if you choose to sign in with Google.
              </List.Item>
            </List.Root>
          </Section>

          <Section title="Deleting your data">
            <Text>
              Email <Link href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</Link> from
              the address on your account and we will delete the account along with all of
              its recordings and history.
            </Text>
          </Section>

          <Section title="Changes and contact">
            <Text>
              If this policy changes, the date above will change with it. Questions go to{" "}
              <Link href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</Link>.
            </Text>
          </Section>
        </Stack>
      </Container>
    </Box>
  );
}
