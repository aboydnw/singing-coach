"use client";

import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { resynthesize } from "@/lib/api";
import { signedAudioUrl } from "@/lib/sessions";

const LABELS: Record<string, string> = {
  steady_pitch: "the same note held steady",
  healthy_vibrato: "the same note with an even vibrato",
};

/** Your take, then your take with one thing fixed.
 *
 * The pair is the point: the difference between the two clips is the lesson,
 * which is why they sit in one control rather than being two files to find. */
export function HearItRight({
  audioKey,
  correction,
}: {
  audioKey: string;
  correction: string;
}) {
  const [correctedUrl, setCorrectedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const [mine, correctedKey] = await Promise.all([
        signedAudioUrl(audioKey),
        resynthesize(audioKey, correction),
      ]);
      const theirs = await signedAudioUrl(correctedKey);
      if (!mine || !theirs) throw new Error("could not load the clips");
      setOriginalUrl(mine);
      setCorrectedUrl(theirs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not build the example");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box borderWidth="1px" borderColor="grid" rounded="md" p={4} bg="panel">
      <Stack gap={3}>
        <Text fontWeight="medium" color="ink.900" fontSize="sm">
          Hear it right
        </Text>
        {!correctedUrl && (
          <>
            <Text color="cream.600" fontSize="sm">
              Rebuild this take as {LABELS[correction] ?? "a corrected version"}, in your
              own voice, so you can hear the target instead of reading about it.
            </Text>
            <Button
              alignSelf="start"
              size="sm"
              variant="outline"
              colorPalette="teal"
              onClick={build}
              loading={busy}
              loadingText="Building…"
            >
              Build the example
            </Button>
          </>
        )}
        {error && (
          <Text color="coral.600" fontSize="sm">
            {error}
          </Text>
        )}
        {correctedUrl && originalUrl && (
          <Stack gap={3}>
            <Box>
              <Text color="cream.600" fontSize="xs" mb={1}>
                What you sang
              </Text>
              <audio controls src={originalUrl} style={{ width: "100%" }} />
            </Box>
            <Box>
              <Text color="cream.600" fontSize="xs" mb={1}>
                {LABELS[correction] ?? "corrected"}
              </Text>
              <audio controls src={correctedUrl} style={{ width: "100%" }} />
            </Box>
            <Text color="cream.600" fontSize="xs">
              The second clip is your voice with the pitch rebuilt by the computer — a
              target to copy, not a recording of you actually doing it.
            </Text>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
