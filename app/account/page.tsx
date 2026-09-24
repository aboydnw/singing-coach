"use client";

import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAuth } from "@/app/providers";
import { type AuthNotice, SetPasswordForm } from "@/components/auth/AuthForms";
import { Shell } from "@/components/Shell";
import { friendlyAuthMessage } from "@/lib/authMessages";
import { supabase } from "@/lib/supabase";

export default function AccountPage() {
  const { session } = useAuth();

  return (
    <Shell>
      <Stack gap={5} maxW="md">
        <Heading size="lg" color="ink.900">
          Account
        </Heading>
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          <Text color="ink.900">
            Signed in as <b>{session?.user.email}</b>
          </Text>
          <Text color="cream.600" mt={1} fontSize="sm">
            Recordings and history are private to this account.
          </Text>
          <Button
            mt={4}
            variant="outline"
            colorPalette="coral"
            onClick={() => supabase().auth.signOut()}
          >
            Sign out
          </Button>
        </Box>
        <ChangePassword />
      </Stack>
    </Shell>
  );
}

function ChangePassword() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const [formKey, setFormKey] = useState(0);

  const save = async (password: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) {
        setNotice({
          tone: "danger",
          title: "Couldn't change your password",
          body: friendlyAuthMessage(error),
        });
        return;
      }
      setFormKey((key) => key + 1);
      setNotice({ tone: "success", title: "Password updated" });
    } catch {
      setNotice({
        tone: "danger",
        title: "Couldn't change your password",
        body: friendlyAuthMessage(null),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
      <Heading as="h2" size="md" color="ink.900">
        Password
      </Heading>
      <Text color="cream.600" mt={1} mb={4} fontSize="sm">
        Set a new password. If you signed up with Google, this adds email sign-in too.
      </Text>
      <SetPasswordForm
        key={formKey}
        busy={busy}
        notice={notice}
        submitLabel="Update password"
        onSubmit={save}
      />
    </Box>
  );
}
