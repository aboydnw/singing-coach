"use client";

import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useAuth } from "@/app/providers";
import { Shell } from "@/components/Shell";
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
      </Stack>
    </Shell>
  );
}
