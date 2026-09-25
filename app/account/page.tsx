"use client";

import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAuth } from "@/app/providers";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { PRIVACY_CONTACT } from "@/components/PrivacyPolicy";
import { Shell } from "@/components/Shell";
import { deleteAccount } from "@/lib/account";
import { supabase } from "@/lib/supabase";

export default function AccountPage() {
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      window.location.replace("/practice?account=deleted");
    } catch {
      setDeleteError(
        `Something went wrong partway through. Try again, or email ${PRIVACY_CONTACT}.`,
      );
      setDeleting(false);
    }
  };

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
        <DeleteAccountSection busy={deleting} error={deleteError} onDelete={remove} />
      </Stack>
    </Shell>
  );
}
