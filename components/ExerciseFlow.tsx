"use client";

import { Box, Button, Flex, Heading, Spinner, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { PitchChart } from "@/components/PitchChart";
import { Recorder } from "@/components/Recorder";
import { Scorecard } from "@/components/Scorecard";
import { analyze, coach } from "@/lib/api";
import { nextExercise } from "@/lib/exercises";
import { playSequence } from "@/lib/toneGen";
import {
  insertSession,
  latestCalibration,
  latestFocusArea,
  listSessions,
  sessionCount,
  toHistory,
  updateSessionCoaching,
} from "@/lib/sessions";
import type {
  AnalyzeResponse,
  CoachingResult,
  ExerciseSpec,
  FocusArea,
} from "@/lib/schema";

type FlowState =
  | { phase: "loading" }
  | { phase: "no-calibration" }
  | { phase: "ready"; spec: ExerciseSpec | null }
  | { phase: "analyzing"; spec: ExerciseSpec | null }
  | { phase: "coaching"; spec: ExerciseSpec | null; analysis: AnalyzeResponse }
  | {
      phase: "done";
      spec: ExerciseSpec | null;
      analysis: AnalyzeResponse;
      coaching: CoachingResult | null;
      coachingError: string | null;
      sessionId: string;
    };

/** The three-step flow from PR #4: Hear it / Sing it / Get coached, with an
 * exercise already loaded on arrival and an explicit next-exercise action.
 * freeSing drops the exercise spec and the accuracy scoring. */
export function ExerciseFlow({ freeSing = false }: { freeSing?: boolean }) {
  const [state, setState] = useState<FlowState>({ phase: "loading" });
  const [playing, setPlaying] = useState(false);
  const [coldStartHint, setColdStartHint] = useState(false);

  const loadExercise = useCallback(async () => {
    if (freeSing) {
      setState({ phase: "ready", spec: null });
      return;
    }
    try {
      const calibration = await latestCalibration();
      if (!calibration || calibration.tessitura_low_midi === null) {
        setState({ phase: "no-calibration" });
        return;
      }
      const [count, sessions] = await Promise.all([sessionCount(), listSessions()]);
      const focus = latestFocusArea(sessions) as FocusArea | null;
      setState({
        phase: "ready",
        spec: nextExercise(calibration, count, focus),
      });
    } catch {
      setState({ phase: "no-calibration" });
    }
  }, [freeSing]);

  useEffect(() => {
    void loadExercise();
  }, [loadExercise]);

  const hearIt = async (spec: ExerciseSpec) => {
    setPlaying(true);
    const { done } = playSequence(spec.target_notes_midi, spec.duration_per_note_s);
    await done;
    setPlaying(false);
  };

  const onUploaded = async (storageKey: string) => {
    const spec = "spec" in state ? state.spec : null;
    setState({ phase: "analyzing", spec });
    const hintTimer = setTimeout(() => setColdStartHint(true), 12000);
    try {
      const analysis = await analyze(storageKey, spec, "full");
      clearTimeout(hintTimer);
      setColdStartHint(false);
      if (!analysis.measurements) {
        throw new Error("analysis returned no measurements");
      }
      setState({ phase: "coaching", spec, analysis });

      const sessions = await listSessions();
      let coaching: CoachingResult | null = null;
      let coachingError: string | null = null;
      try {
        coaching = await coach(analysis.measurements, spec, toHistory(sessions));
      } catch (error) {
        coachingError =
          error instanceof Error ? error.message : "coaching call failed";
      }
      const sessionId = await insertSession({
        spec,
        measurements: analysis.measurements,
        coaching,
        audioKey: storageKey,
      });
      setState({ phase: "done", spec, analysis, coaching, coachingError, sessionId });
    } catch (error) {
      clearTimeout(hintTimer);
      setColdStartHint(false);
      setState({ phase: "ready", spec });
      alert(error instanceof Error ? error.message : "analysis failed");
    }
  };

  const retryCoaching = async () => {
    if (state.phase !== "done" || !state.analysis.measurements) return;
    const sessions = await listSessions();
    try {
      const coaching = await coach(
        state.analysis.measurements,
        state.spec,
        toHistory(sessions.filter((s) => s.id !== state.sessionId)),
      );
      await updateSessionCoaching(state.sessionId, coaching);
      setState({ ...state, coaching, coachingError: null });
    } catch (error) {
      setState({
        ...state,
        coachingError:
          error instanceof Error ? error.message : "coaching call failed",
      });
    }
  };

  if (state.phase === "loading") {
    return <Spinner color="coral.500" />;
  }

  if (state.phase === "no-calibration") {
    return (
      <Text color="cream.600">
        Calibrate your range first — the Calibrate tab takes about two minutes.
      </Text>
    );
  }

  const spec = state.spec;

  return (
    <Stack gap={6}>
      {spec && (
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          <Heading size="md" color="ink.900">
            {spec.display_name}
          </Heading>
          <Text color="cream.600" mt={1} fontSize="sm">
            {spec.target_notes_midi.length} note
            {spec.target_notes_midi.length > 1 ? "s" : ""},{" "}
            {spec.duration_per_note_s}s each, on “{spec.vowel}”
          </Text>
          <Flex mt={4} gap={3} align="center" wrap="wrap">
            <Button
              variant="outline"
              colorPalette="teal"
              onClick={() => hearIt(spec)}
              disabled={playing || state.phase === "analyzing"}
            >
              {playing ? "Playing…" : "1 · Hear it"}
            </Button>
            <Text color="cream.600" fontSize="sm">
              then
            </Text>
            <Box>
              <Recorder
                onUploaded={onUploaded}
                disabled={state.phase === "analyzing" || state.phase === "coaching"}
              />
            </Box>
          </Flex>
        </Box>
      )}
      {!spec && (
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          <Heading size="md" color="ink.900">
            Free sing
          </Heading>
          <Text color="cream.600" mt={1} fontSize="sm">
            Sing whatever you like; you get the same measurements, minus the
            note-accuracy score.
          </Text>
          <Box mt={4}>
            <Recorder
              onUploaded={onUploaded}
              disabled={state.phase === "analyzing" || state.phase === "coaching"}
            />
          </Box>
        </Box>
      )}

      {state.phase === "analyzing" && (
        <Flex align="center" gap={3}>
          <Spinner color="coral.500" />
          <Text color="cream.600">
            Analyzing — this usually takes 10–30 seconds.
            {coldStartHint &&
              " The first analysis after a quiet spell takes longer while the engine wakes up."}
          </Text>
        </Flex>
      )}
      {state.phase === "coaching" && (
        <Flex align="center" gap={3}>
          <Spinner color="teal.500" />
          <Text color="cream.600">Measurements in — getting coaching…</Text>
        </Flex>
      )}

      {(state.phase === "coaching" || state.phase === "done") && (
        <Stack gap={5}>
          <PitchChart contour={state.analysis.contour} spec={spec} />
          {state.analysis.measurements && (
            <Scorecard measurements={state.analysis.measurements} />
          )}
        </Stack>
      )}

      {state.phase === "done" && (
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          {state.coaching ? (
            <Stack gap={2}>
              <Heading size="md" color="coral.600">
                🎯 {state.coaching.top_issue}
              </Heading>
              <Text color="ink.900">{state.coaching.why}</Text>
              <Text color="ink.900">
                <b>Try this:</b> {state.coaching.drill}
              </Text>
              <Text color="cream.600" fontStyle="italic">
                {state.coaching.encouragement}
              </Text>
            </Stack>
          ) : (
            <Stack gap={3}>
              <Text color="coral.600">
                ⚠️ <b>Measurements saved, but the coaching call failed.</b> Your
                scores are above — retry when ready.
              </Text>
              {state.coachingError && (
                <Text color="cream.600" fontSize="sm">
                  {state.coachingError}
                </Text>
              )}
              <Button
                alignSelf="start"
                variant="outline"
                colorPalette="coral"
                onClick={retryCoaching}
              >
                Retry coaching
              </Button>
            </Stack>
          )}
          <Button mt={5} colorPalette="coral" onClick={loadExercise}>
            {freeSing ? "Sing again" : "Next exercise →"}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
