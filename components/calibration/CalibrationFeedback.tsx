import { Box, Text, VisuallyHidden } from "@chakra-ui/react";
import { AppNotice } from "@/components/ui/AppNotice";
import { midiToName } from "@/lib/exercises";

export type CalibrationNotice = {
  tone: "danger" | "success";
  message: string;
};

/** Keep both live regions mounted before an asynchronous result arrives. */
export function CalibrationFeedback({ notice }: { notice: CalibrationNotice | null }) {
  return (
    <>
      <Box role="alert" aria-atomic="true">
        {notice?.tone === "danger" ? (
          <Box mt={3}>
            <AppNotice tone="danger" title={notice.message} announce={false} />
          </Box>
        ) : null}
      </Box>
      <Box role="status" aria-live="polite" aria-atomic="true">
        {notice?.tone === "success" ? (
          <Box mt={3}>
            <AppNotice tone="success" title={notice.message} announce={false} />
          </Box>
        ) : null}
      </Box>
    </>
  );
}

/** Only this slot's detection transitions change its live-region contents. */
export function CalibrationPitchStatus({
  label,
  detecting,
  midi,
}: {
  label: string;
  detecting: boolean;
  midi: number | null;
}) {
  return (
    <Text
      mt={3}
      color={midi !== null ? "teal.600" : "cream.600"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <VisuallyHidden>{label}: </VisuallyHidden>
      {detecting
        ? "Detecting…"
        : midi !== null
          ? `${midiToName(midi)}  (MIDI ${midi})`
          : "Not recorded yet"}
    </Text>
  );
}
