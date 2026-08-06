"use client";

import {
  Box,
  Button,
  Center,
  Heading,
  Input,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { useAuth } from "@/app/providers";
import { supabase } from "@/lib/supabase";

/** The whole app sits behind this: no session, no pages. Unlike the Gradio
 * version, signing in controls entry as well as data scope. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Center minH="100vh">
        <Spinner color="coral.500" size="xl" />
      </Center>
    );
  }
  if (!session) {
    return <SignIn />;
  }
  return <>{children}</>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error) setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase().auth.signUp({ email, password });
      setStatus(error ? error.message : "Check your email to confirm the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center minH="100vh" bg="cream.100">
      <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="lg" p={8} w="sm">
        <Stack gap={4}>
          <Heading size="lg" color="ink.900">
            🎤 Singing Coach
          </Heading>
          <Text color="cream.600">Sign in to start practicing.</Text>
          <Input
            placeholder="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            bg="white"
          />
          <Input
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            bg="white"
          />
          <Button colorPalette="coral" onClick={signIn} loading={busy}>
            Sign in
          </Button>
          <Button variant="outline" onClick={signUp} loading={busy}>
            Sign up
          </Button>
          {status && <Text color="coral.600">{status}</Text>}
        </Stack>
      </Box>
    </Center>
  );
}
