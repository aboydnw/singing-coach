"use client";

import { Box, Button, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Recorder } from "@/components/Recorder";
import { Shell } from "@/components/Shell";
import { analyze } from "@/lib/api";
import { midiToName } from "@/lib/exercises";
import { latestCalibration, saveCalibration } from "@/lib/sessions";

type Take = { storageKey: string; midi: number } | null;

const SLOTS = [
  { id: "lowComf", label: "Lowest comfortable note" },
  { id: "highComf", label: "Highest comfortable note" },
  { id: "lowEdge", label: "Lowest note you can reach" },
  { id: "highEdge", label: "Highest note you can reach" },
] as const;

type SlotId = (typeof SLOTS)[number]["id"];

/** The detected note and the value that gets saved both come from the same
 * Take object — the fix from PR #7. There is no separate label state to drift. */
export default function CalibratePage() {
  const [takes, setTakes] = useState<Record<SlotId, Take>>({
    lowComf: null,
    highComf: null,
    lowEdge: null,
    highEdge: null,
  });
  const [detecting, setDetecting] = useState<SlotId | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    latestCalibration()
      .then((calibration) => {
        if (calibration && calibration.tessitura_low_midi !== null) {
          setCurrent(
            `Current: range ${midiToName(calibration.range_low_midi)}–${midiToName(
              calibration.range_high_midi,
            )}, tessitura ${midiToName(calibration.tessitura_low_midi)}–${midiToName(
              calibration.tessitura_high_midi!,
            )}.`,
          );
        }
      })
      .catch(() => {});
  }, []);

  const onUploaded = async (slot: SlotId, storageKey: string) => {
    setDetecting(slot);
    setStatus(null);
    try {
      const result = await analyze(storageKey, null, "pitch_only");
      if (result.pitch_median_midi === null) {
        setStatus(`No clear pitch detected for "${slotLabel(slot)}" — try again.`);
        setTakes((prev) => ({ ...prev, [slot]: null }));
      } else {
        const midi = Math.round(result.pitch_median_midi);
        setTakes((prev) => ({ ...prev, [slot]: { storageKey, midi } }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "analysis failed");
      setTakes((prev) => ({ ...prev, [slot]: null }));
    } finally {
      setDetecting(null);
    }
  };

  const save = async () => {
    const { lowComf, highComf, lowEdge, highEdge } = takes;
    const missing = SLOTS.filter((slot) => takes[slot.id] === null);
    if (missing.length > 0) {
      setStatus(
        `Still need a clear recording for: ${missing.map((s) => s.label).join(", ")}.`,
      );
      return;
    }
    if (
      !(lowEdge!.midi <= lowComf!.midi && lowComf!.midi <= highComf!.midi &&
        highComf!.midi <= highEdge!.midi)
    ) {
      setStatus("Expected: low edge ≤ low comfortable ≤ high comfortable ≤ high edge.");
      return;
    }
    setSaving(true);
    try {
      await saveCalibration({
        range_low_midi: lowEdge!.midi,
        range_high_midi: highEdge!.midi,
        tessitura_low_midi: lowComf!.midi,
        tessitura_high_midi: highComf!.midi,
      });
      setStatus(
        `Saved. Range: ${midiToName(lowEdge!.midi)}–${midiToName(highEdge!.midi)}; ` +
          `tessitura: ${midiToName(lowComf!.midi)}–${midiToName(highComf!.midi)}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <Stack gap={6}>
        <Box>
          <Heading size="lg" color="ink.900">
            Calibrate your range
          </Heading>
          <Text color="cream.600" mt={1}>
            Sing and hold a single note for each prompt. Detection takes a few
            seconds per take — the first one after a while is slower while the
            analysis engine wakes up.
          </Text>
          {current && (
            <Text color="teal.600" mt={2}>
              {current}
            </Text>
          )}
        </Box>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
          {SLOTS.map((slot) => (
            <Box
              key={slot.id}
              bg="panel"
              borderWidth="1px"
              borderColor="grid"
              rounded="md"
              p={4}
            >
              <Recorder
                label={slot.label}
                onUploaded={(key) => onUploaded(slot.id, key)}
                disabled={detecting !== null}
              />
              <Text mt={3} color={takes[slot.id] ? "teal.600" : "cream.600"}>
                {detecting === slot.id
                  ? "Detecting…"
                  : takes[slot.id]
                    ? `${midiToName(takes[slot.id]!.midi)}  (MIDI ${takes[slot.id]!.midi})`
                    : "Not recorded yet"}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
        <Box>
          <Button colorPalette="coral" onClick={save} loading={saving}>
            Save calibration
          </Button>
          {status && (
            <Text mt={3} color="coral.600">
              {status}
            </Text>
          )}
        </Box>
      </Stack>
    </Shell>
  );
}

function slotLabel(id: SlotId): string {
  return SLOTS.find((slot) => slot.id === id)!.label;
}
