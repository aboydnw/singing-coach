"use client";

import {
  Box,
  Button,
  Center,
  Field,
  Flex,
  Heading,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { AppNotice } from "@/components/ui/AppNotice";
import { Surface } from "@/components/ui/Surface";
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from "@/lib/authMessages";

export type AuthMode = "sign-in" | "sign-up" | "forgot";

export type AuthNotice = {
  tone: "danger" | "success";
  title: string;
  body?: string;
} | null;

const COPY: Record<AuthMode, { heading: string; lead: string; submit: string }> = {
  "sign-in": {
    heading: "Welcome back",
    lead: "Sign in to pick up your practice.",
    submit: "Sign in",
  },
  "sign-up": {
    heading: "Create your account",
    lead: "Your recordings and progress stay private to you.",
    submit: "Create account",
  },
  forgot: {
    heading: "Reset your password",
    lead: "Enter your email and we'll send you a link to choose a new password.",
    submit: "Send reset link",
  },
};

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
    <Center minH="100vh" bg="bg.canvas" px={4} py={10}>
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

/** Signed-out screen: Google, email and password, sign-up, and password-reset request. */
export function SignInPanel({
  mode,
  busy,
  notice,
  onModeChange,
  onSubmit,
  onGoogle,
}: {
  mode: AuthMode;
  busy: boolean;
  notice: AuthNotice;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string) => void;
  onGoogle: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const copy = COPY[mode];

  return (
    <AuthCard heading={copy.heading} lead={copy.lead}>
      {mode !== "forgot" ? (
        <>
          <Button variant="outline" onClick={onGoogle} disabled={busy}>
            Continue with Google
          </Button>
          <Flex align="center" gap={3} aria-hidden="true">
            <Box flex="1" borderTopWidth="1px" borderColor="border.default" />
            <Text fontSize="sm" color="fg.muted">
              or use email
            </Text>
            <Box flex="1" borderTopWidth="1px" borderColor="border.default" />
          </Flex>
        </>
      ) : null}
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
              autoComplete={mode === "sign-up" ? "email" : "username"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              bg="bg.surface"
            />
          </Field.Root>
          {mode !== "forgot" ? (
            <Field.Root required>
              <Field.Label>Password</Field.Label>
              <Input
                name="password"
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                bg="bg.surface"
              />
              {mode === "sign-up" ? (
                <Field.HelperText>
                  At least {MIN_PASSWORD_LENGTH} characters.
                </Field.HelperText>
              ) : null}
            </Field.Root>
          ) : null}
          <Notice notice={notice} />
          <Button type="submit" colorPalette="coral" loading={busy}>
            {copy.submit}
          </Button>
        </Stack>
      </form>
      <Stack gap={1} align="center">
        {mode === "sign-in" ? (
          <>
            <Button variant="plain" size="sm" onClick={() => onModeChange("forgot")}>
              Forgot your password?
            </Button>
            <Button variant="plain" size="sm" onClick={() => onModeChange("sign-up")}>
              New here? Create an account
            </Button>
          </>
        ) : (
          <Button variant="plain" size="sm" onClick={() => onModeChange("sign-in")}>
            {mode === "sign-up" ? "Already have an account? Sign in" : "Back to sign in"}
          </Button>
        )}
      </Stack>
    </AuthCard>
  );
}

/** New password plus confirmation, validated before it is submitted. */
export function SetPasswordForm({
  busy,
  notice,
  submitLabel,
  onSubmit,
}: {
  busy: boolean;
  notice: AuthNotice;
  submitLabel: string;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const found = newPasswordProblem(password, confirmation);
        setProblem(found);
        if (!found) onSubmit(password);
      }}
    >
      <Stack gap={4}>
        <Field.Root required>
          <Field.Label>New password</Field.Label>
          <Input
            name="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            bg="bg.surface"
          />
          <Field.HelperText>At least {MIN_PASSWORD_LENGTH} characters.</Field.HelperText>
        </Field.Root>
        <Field.Root required invalid={Boolean(problem)}>
          <Field.Label>Confirm new password</Field.Label>
          <Input
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            bg="bg.surface"
          />
          {problem ? <Field.ErrorText>{problem}</Field.ErrorText> : null}
        </Field.Root>
        <Notice notice={notice} />
        <Button type="submit" colorPalette="coral" loading={busy}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  );
}
