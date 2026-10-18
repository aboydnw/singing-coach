"use client";

import { Button, Dialog, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { AppNotice } from "@/components/ui/AppNotice";
import { Surface } from "@/components/ui/Surface";

export const DELETE_CONFIRMATION = "delete";

/** Account danger zone: permanently deletes the account after a typed confirmation. */
export function DeleteAccountSection({
  busy,
  error,
  onDelete,
}: {
  busy: boolean;
  error: string | null;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === DELETE_CONFIRMATION;

  return (
    <Surface p={5}>
      <Stack gap={3} align="start">
        <Heading as="h2" size="md" color="fg.default">
          Delete account
        </Heading>
        <Text color="fg.muted" fontSize="sm">
          Permanently delete your account, recordings, calibration, and practice history.
          This cannot be undone.
        </Text>
        <Button
          variant="outline"
          colorPalette="coral"
          onClick={() => {
            setTyped("");
            setOpen(true);
          }}
        >
          Delete account…
        </Button>
      </Stack>

      <Dialog.Root
        open={open}
        onOpenChange={(event) => {
          if (!busy) setOpen(event.open);
        }}
        role="alertdialog"
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content rounded="xl" mx={4}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (confirmed && !busy) onDelete();
              }}
            >
              <Dialog.Header>
                <Dialog.Title>Delete your account?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap={4}>
                  <Text color="fg.muted">
                    Every recording, calibration, and practice session will be deleted
                    immediately. There is no way to recover them.
                  </Text>
                  <Field.Root>
                    <Field.Label>Type “{DELETE_CONFIRMATION}” to confirm</Field.Label>
                    <Input
                      name="confirm-delete"
                      autoComplete="off"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      bg="bg.surface"
                    />
                  </Field.Root>
                  {error ? (
                    <AppNotice tone="danger" title="Couldn't delete your account">
                      {error}
                    </AppNotice>
                  ) : null}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="ghost" disabled={busy}>
                    Keep my account
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  type="submit"
                  colorPalette="coral"
                  disabled={!confirmed}
                  loading={busy}
                >
                  Delete forever
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Surface>
  );
}
