"use client";

import { Box, Button, Flex, Heading, Spinner, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { PitchChart } from "@/components/PitchChart";
import { Recorder } from "@/components/Recorder";
import { Scorecard } from "@/components/Scorecard";
import { Drill } from "@/components/Drill";
import { HearItRight } from "@/components/HearItRight";
import { analyze, coach } from "@/lib/api";
import { exerciseForDrill, nextExercise, skipExercise } from "@/lib/exercises";
import { playSequence } from "@/lib/toneGen";
import {
  bestPriorTake,
  insertSession,
  latestCalibration,
  latestFocusArea,
  listSessions,
  sessionCount,
  toHistory,
  updateSessionCoaching,
} from "@/lib/sessions";
import type { Ghost } from "@/lib/sessions";
import type {
  AnalyzeResponse,
  Calibration,
  CoachingResponse,
  ExerciseSpec,
  Measurements,
  FocusArea,
} from "@/lib/schema";

type FlowState =
  | { phase: "loading" }
  | { phase: "no-calibration" }
  | { phase: "load-failed"; message: string }
  | { phase: "ready"; spec: ExerciseSpec | null }
  | { phase: "analyzing"; spec: ExerciseSpec | null }
  | { phase: "coaching"; spec: ExerciseSpec | null; analysis: AnalyzeResponse }
  | {
      phase: "done";
      spec: ExerciseSpec | null;
      analysis: AnalyzeResponse;
      coaching: CoachingResponse | null;
      coachingError: string | null;
      /** null when the session could not be written. The analysis is still
       * worth showing: it is the thing the singer waited for. */
      sessionId: string | null;
      saveError: string | null;
      audioKey: string;
    };

/** How this take compares to the singer's own best previous attempt at the same
 * drill. Absolute thresholds do not transfer between people; a personal best
 * does, which is why this sits next to the chart rather than in the scorecard. */
function GhostNote({
  ghost,
  measurements,
}: {
  ghost: Ghost | null;
  measurements: Measurements | null;
}) {
  if (!ghost) {
    return (
      <Text color="cream.600" fontSize="sm">
        No previous take of this exercise yet — this one becomes the mark to beat.
      </Text>
    );
  }
  const now = measurements?.accuracy?.mean_abs_cents_off ?? null;
  const when = new Date(ghost.ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (now === null) {
    return (
      <Text color="cream.600" fontSize="sm">
        Faded line is your best take of this exercise, from {when}.
      </Text>
    );
  }
  const delta = ghost.meanAbsCentsOff - now;
  const rounded = Math.abs(Math.round(delta));
  const verdict =
    rounded === 0
      ? `level with your best, from ${when}`
      : delta > 0
        ? `${rounded} cents closer than your best, from ${when}`
        : `${rounded} cents further off than your best, from ${when}`;
  return (
    <Text color={delta >= 0 ? "teal.600" : "cream.600"} fontSize="sm">
      {verdict}.
    </Text>
  );
}

/** What the coach picked for this visit, kept so a skip can walk the rotation
 * forward without refetching, and so the coach's pick can be restored. */
type Pick = {
  calibration: Calibration;
  baseIndex: number;
  coachFocus: FocusArea | null;
  skippedTo: number | null;
};

/** The three-step flow from PR #4: Hear it / Sing it / Get coached, with an
 * exercise already loaded on arrival and an explicit next-exercise action.
 * freeSing drops the exercise spec and the accuracy scoring. */
export function ExerciseFlow({ freeSing = false }: { freeSing?: boolean }) {
  const [state, setState] = useState<FlowState>({ phase: "loading" });
  const [pick, setPick] = useState<Pick | null>(null);
  const [playing, setPlaying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [coldStartHint, setColdStartHint] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const loadExercise = useCallback(async () => {
    setGhost(null);
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
      setPick({
        calibration,
        baseIndex: count,
        coachFocus: focus,
        skippedTo: null,
      });
      setState({
        phase: "ready",
        spec: nextExercise(calibration, count, focus),
      });
    } catch (error) {
      // Not "no-calibration". This catch used to swallow every failure into
      // that one phase, so a missing database column told a singer who had
      // just calibrated to go and calibrate - advice that could not work and
      // that hid the real fault. Only the explicit check above knows the
      // calibration is absent; anything reaching here is a genuine error.
      setState({
        phase: "load-failed",
        message: error instanceof Error ? error.message : "could not load an exercise",
      });
    }
  }, [freeSing]);

  /** Swap in a different drill without recording this one first. */
  const skipToDifferent = () => {
    if (!pick || state.phase !== "ready" || !state.spec) return;
    const from = pick.skippedTo ?? pick.baseIndex;
    const { spec, index } = skipExercise(pick.calibration, from, state.spec);
    setPick({ ...pick, skippedTo: index });
    setState({ phase: "ready", spec });
  };

  /** Jump straight to the drill the coach just assigned. Skips the rotation
   * because the point of the button is to do that specific drill now. */
  const practiceDrill = (exerciseType: string) => {
    if (!pick || state.phase !== "done" || !state.coaching) return;
    const drill = state.coaching.resolved.drill;
    setGhost(null);
    try {
      const spec = exerciseForDrill(
        pick.calibration,
        pick.baseIndex,
        exerciseType,
        drill.name,
      );
      setState({ phase: "ready", spec });
    } catch {
      void loadExercise();
    }
  };

  /** Back to what the app offered on arrival — the coach's focus drove it only
   * once there is coaching history, but it is restorable either way. */
  const restoreSuggested = () => {
    if (!pick) return;
    setPick({ ...pick, skippedTo: null });
    setState({
      phase: "ready",
      spec: nextExercise(pick.calibration, pick.baseIndex, pick.coachFocus),
    });
  };

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

      // Saving is allowed to fail without costing the singer the analysis.
      // Losing a hard-won recording because a write failed is the wrong trade.
      let sessionId: string | null = null;
      let saveError: string | null = null;
      try {
        sessionId = await insertSession({
          spec,
          measurements: analysis.measurements,
          coaching: null,
          audioKey: storageKey,
          contour: analysis.contour,
        });
      } catch (error) {
        saveError = error instanceof Error ? error.message : "could not save the session";
      }

      let coaching: CoachingResponse | null = null;
      let coachingError: string | null = null;
      try {
        const sessions = await listSessions();
        setGhost(bestPriorTake(sessions, spec, sessionId ?? undefined));
        coaching = await coach(
          analysis.measurements,
          spec,
          toHistory(sessions.filter((s) => s.id !== sessionId)),
        );
        if (sessionId !== null) await updateSessionCoaching(sessionId, coaching);
      } catch (error) {
        coaching = null;
        coachingError = error instanceof Error ? error.message : "coaching call failed";
      }
      setState({
        phase: "done",
        spec,
        analysis,
        coaching,
        coachingError,
        sessionId,
        saveError,
        audioKey: storageKey,
      });
    } catch (error) {
      clearTimeout(hintTimer);
      setColdStartHint(false);
      setState({ phase: "ready", spec });
      alert(error instanceof Error ? error.message : "analysis failed");
    }
  };

  const retryCoaching = async () => {
    if (state.phase !== "done" || !state.analysis.measurements) return;
    const sessionId = state.sessionId;
    setRetrying(true);
    try {
      const sessions = await listSessions();
      const coaching = await coach(
        state.analysis.measurements,
        state.spec,
        toHistory(sessions.filter((s) => s.id !== sessionId)),
      );
      if (sessionId !== null) await updateSessionCoaching(sessionId, coaching);
      setState({ ...state, coaching, coachingError: null });
    } catch (error) {
      setState({
        ...state,
        coachingError: error instanceof Error ? error.message : "coaching call failed",
      });
    } finally {
      setRetrying(false);
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

  if (state.phase === "load-failed") {
    return (
      <Stack gap={3} align="start">
        <Text color="coral.600">
          ⚠️ <b>Could not load an exercise.</b> We could not confirm whether your
          calibration or session history was available.
        </Text>
        <Text color="cream.600" fontSize="sm">
          {state.message}
        </Text>
        <Button variant="outline" colorPalette="coral" onClick={loadExercise}>
          Try again
        </Button>
      </Stack>
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
            {spec.target_notes_midi.length > 1 ? "s" : ""}, {spec.duration_per_note_s}s
            each, on “{spec.vowel}”
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
          {state.phase === "ready" && (
            <Flex mt={4} gap={4} align="center" wrap="wrap">
              <Button
                size="sm"
                variant="ghost"
                colorPalette="teal"
                onClick={skipToDifferent}
              >
                Not this one — give me a different exercise
              </Button>
              {pick && pick.skippedTo !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  colorPalette="coral"
                  onClick={restoreSuggested}
                >
                  {pick.coachFocus
                    ? "Back to the coach’s pick"
                    : "Back to the suggested exercise"}
                </Button>
              )}
            </Flex>
          )}
        </Box>
      )}
      {!spec && (
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          <Heading size="md" color="ink.900">
            Free sing
          </Heading>
          <Text color="cream.600" mt={1} fontSize="sm">
            Sing whatever you like; you get the same measurements, minus the note-accuracy
            score.
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

      {state.phase === "done" && state.saveError && (
        <Box bg="panel" borderWidth="1px" borderColor="coral.300" rounded="md" p={4}>
          <Text color="coral.600">
            ⚠️ <b>This session was not saved.</b> Your scores below are real, but they
            will not appear in Progress and cannot be replayed later.
          </Text>
          <Text color="cream.600" fontSize="sm" mt={1}>
            {state.saveError}
          </Text>
        </Box>
      )}

      {(state.phase === "coaching" || state.phase === "done") && (
        <Stack gap={5}>
          <Stack gap={2}>
            <PitchChart contour={state.analysis.contour} spec={spec} ghost={ghost} />
            {spec && (
              <GhostNote ghost={ghost} measurements={state.analysis.measurements} />
            )}
          </Stack>
          {state.analysis.measurements && (
            <Scorecard measurements={state.analysis.measurements} />
          )}
        </Stack>
      )}

      {state.phase === "done" && (
        <Box bg="panel" borderWidth="1px" borderColor="grid" rounded="md" p={5}>
          {state.coaching ? (
            <Stack gap={3}>
              {state.coaching.calibrating && (
                <Text color="cream.600" fontSize="sm">
                  Still learning your normal range — the first few sessions set your
                  baseline, so treat this as a first impression rather than a diagnosis.
                </Text>
              )}
              <Heading size="md" color="coral.600">
                🎯 {state.coaching.top_issue}
              </Heading>
              <Text color="ink.900">{state.coaching.why}</Text>
              <Text color="ink.900">
                <b>Try this:</b> {state.coaching.drill}
              </Text>
              <Drill resolved={state.coaching.resolved} onPractice={practiceDrill} />
              {state.coaching.resolved.audible_correction && (
                <HearItRight
                  audioKey={state.audioKey}
                  correction={state.coaching.resolved.audible_correction}
                />
              )}
              <Text color="cream.600" fontStyle="italic">
                {state.coaching.encouragement}
              </Text>
            </Stack>
          ) : (
            <Stack gap={3}>
              <Text color="coral.600">
                ⚠️ <b>Measurements saved, but the coaching call failed.</b> Your scores
                are above — retry when ready.
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
                loading={retrying}
                loadingText="Retrying…"
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
