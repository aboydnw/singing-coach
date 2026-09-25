"use client";

import { Button, Center, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { AppFooter } from "@/components/AppFooter";
import { AppNotice } from "@/components/ui/AppNotice";
import { Surface } from "@/components/ui/Surface";

export type AuthNotice = {
  tone: "danger" | "success";
  title: string;
  body?: string;
} | null;

/** Centered card that frames every signed-out screen. */
export function AuthCard({
  heading,
  lead,
  children,
}: {
  heading: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <Center minH="100vh" bg="bg.canvas" px={4} pt={10} flexDirection="column">
      <Surface variant="raised" p={{ base: 6, md: 8 }} w="full" maxW="sm">
        <Stack gap={5}>
          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold" color="fg.muted">
              🎤 Singing Coach
            </Text>
            <Heading as="h1" size="lg" color="fg.default">
              {heading}
            </Heading>
            <Text color="fg.muted">{lead}</Text>
          </Stack>
          {children}
        </Stack>
      </Surface>
      <AppFooter />
    </Center>
  );
}

function Notice({ notice }: { notice: AuthNotice }) {
  if (!notice) return null;
  return (
    <AppNotice tone={notice.tone} title={notice.title}>
      {notice.body}
    </AppNotice>
  );
}

/** Signed-out screen. Google is the only visible option; `onEmailSignIn` adds the
 * email and password form used as a fallback for existing accounts. */
export function SignInPanel({
  busy,
  notice,
  onGoogle,
  onEmailSignIn,
}: {
  busy: boolean;
  notice: AuthNotice;
  onGoogle: () => void;
  onEmailSignIn?: (email: string, password: string) => void;
}) {
  return (
    <AuthCard
      heading="Welcome"
      lead="Sign in to practice. Your recordings and progress stay private to you."
    >
      <Button colorPalette="coral" onClick={onGoogle} loading={busy}>
        Continue with Google
      </Button>
      {onEmailSignIn ? <EmailSignInForm busy={busy} onSubmit={onEmailSignIn} /> : null}
      <Notice notice={notice} />
    </AuthCard>
  );
}

function EmailSignInForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email.trim(), password);
      }}
    >
      <Stack gap={4}>
        <Field.Root required>
          <Field.Label>Email</Field.Label>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            bg="bg.surface"
          />
        </Field.Root>
        <Field.Root required>
          <Field.Label>Password</Field.Label>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            bg="bg.surface"
          />
        </Field.Root>
        <Button type="submit" variant="outline" loading={busy}>
          Sign in with email
        </Button>
      </Stack>
    </form>
  );
}
