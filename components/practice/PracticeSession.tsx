"use client";

import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Grid,
  Heading,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttemptResult } from "@/components/practice/AttemptResult";
import {
  ExerciseProposal,
  type PracticeProposal,
} from "@/components/practice/ExerciseProposal";
import { PracticeCompass } from "@/components/practice/PracticeCompass";
import { PracticeComposer } from "@/components/practice/PracticeComposer";
import { PracticeConversation } from "@/components/practice/PracticeConversation";
import { AppNotice } from "@/components/ui/AppNotice";
import { LoadingSurface } from "@/components/ui/LoadingSurface";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { analyze, coach, streamPracticeCoach } from "@/lib/api";
import { exerciseForDrill, nextExercise, skipExercise } from "@/lib/exercises";
import {
  contractFromAttempt,
  endPractice,
  loadPractice,
  savePracticeMessage,
  updateLearningContract,
  type PracticeBundle,
} from "@/lib/practice";
import {
  coachingResponseSchema,
  type ContextAnchor,
  type CoachingResponse,
  type ExerciseSpec,
  type Measurements,
} from "@/lib/schema";
import { parseStoredJson } from "@/lib/storedJson";
import {
  insertSession,
  latestCalibration,
  listSessions,
  toHistory,
  updateSessionCoaching,
  coachingToMarkdown,
  type SessionRow,
} from "@/lib/sessions";
import { playSequence } from "@/lib/toneGen";

export function PracticeSession() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [bundle, setBundle] = useState<PracticeBundle | null>(null);
  const [proposal, setProposal] = useState<PracticeProposal | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [anchor, setAnchor] = useState<ContextAnchor | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [unsavedAttempt, setUnsavedAttempt] = useState<SessionRow | null>(null);
  const [coachingRetry, setCoachingRetry] = useState<{
    attemptId: string;
    measurements: Measurements;
    spec: ExerciseSpec | null;
  } | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [details, setDetails] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const loaded = await loadPractice(params.id);
    setBundle(loaded);
    return loaded;
  }, [params.id]);

  useEffect(() => {
    refresh()
      .then(async (loaded) => {
        if (loaded.practice.status === "ended") return;
        if (loaded.practice.starting_direction === "free_sing") {
          setProposal({
            spec: null,
            reason:
              "Sing something familiar and notice what your voice naturally does today.",
            parentAttemptId: null,
            retry: false,
          });
          return;
        }
        const calibration = await latestCalibration();
        if (!calibration || calibration.tessitura_low_midi === null) {
          setNeedsCalibration(true);
          return;
        }
        const latest = loaded.attempts.at(-1);
        const spec = chooseProposalSpec(loaded, calibration);
        setProposal({
          spec,
          reason: latest
            ? "Use the last attempt while it is still easy to remember, or take the next step when you are ready."
            : "This gives us a clear first pattern to listen for without asking you to do too much at once.",
          parentAttemptId: null,
          retry: false,
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not open this practice.",
        ),
      );
  }, [refresh]);

  const contract = bundle?.practice.learning_contract_json;
  const ended = bundle?.practice.status === "ended";

  const askAbout = (
    label: string,
    value: string,
    sourceId: string,
    kind: ContextAnchor["kind"] = "coaching_text",
  ) => {
    setAnchor({ kind, label, value, sourceId });
    setQuestion("");
    requestAnimationFrame(() => document.getElementById("practice-question")?.focus());
  };

  const sendQuestion = async () => {
    const text = question.trim();
    if (!bundle || !text || streaming || ended) return;
    const attemptId = bundle.attempts.at(-1)?.id;
    if (!attemptId) return;
    const clientRequestId = crypto.randomUUID();
    const assistantRequestId = crypto.randomUUID();
    setStreaming(true);
    setStreamingText("");
    setQuestion("");
    try {
      const userMessage = await savePracticeMessage({
        practiceSessionId: bundle.practice.id,
        attemptId,
        role: "user",
        text,
        contextAnchor: anchor,
        clientRequestId,
      });
      setBundle((current) =>
        current ? { ...current, messages: [...current.messages, userMessage] } : current,
      );
      const controller = new AbortController();
      abortRef.current = controller;
      const answer = await streamPracticeCoach(
        bundle.practice.id,
        attemptId,
        text,
        anchor,
        assistantRequestId,
        userMessage.id,
        (delta) => setStreamingText((current) => current + delta),
        controller.signal,
      );
      if (!answer) throw new Error("The coach returned an empty response.");
      await refresh();
      setAnchor(null);
    } catch (reason) {
      if ((reason as { name?: string })?.name === "AbortError") {
        await refresh();
      } else {
        await refresh().catch(() => undefined);
        setError(
          reason instanceof Error ? reason.message : "The coach could not respond.",
        );
      }
    } finally {
      abortRef.current = null;
      setStreamingText("");
      setStreaming(false);
    }
  };

  const onUploaded = async (audioKey: string) => {
    if (!bundle || !proposal) return;
    setProcessing(true);
    setError(null);
    setUnsavedAttempt(null);
    setCoachingRetry(null);
    try {
      const analysis = await analyze(audioKey, proposal.spec, "full");
      if (!analysis.measurements) throw new Error("Analysis returned no measurements.");
      const allSessions = await listSessions(30);
      let attemptId: string | null = null;
      let saveError: string | null = null;
      try {
        attemptId = await insertSession({
          spec: proposal.spec,
          measurements: analysis.measurements,
          coaching: null,
          audioKey,
          contour: analysis.contour,
          practiceSessionId: bundle.practice.id,
          sequenceNumber: bundle.attempts.length + 1,
          parentAttemptId: proposal.parentAttemptId,
          attemptKind: proposal.retry ? "retry" : "initial",
        });
      } catch (reason) {
        saveError =
          reason instanceof Error ? reason.message : "The attempt was not saved.";
      }

      let coaching: CoachingResponse | null = null;
      let coachingError: string | null = null;
      let coachingSaveError: string | null = null;
      try {
        coaching = await coach(
          analysis.measurements,
          proposal.spec,
          toHistory(allSessions),
          bundle.practice.id,
        );
      } catch (reason) {
        coachingError = reason instanceof Error ? reason.message : "Coaching failed.";
      }

      if (attemptId && coaching) {
        try {
          await updateSessionCoaching(attemptId, coaching);
        } catch (reason) {
          coachingSaveError =
            reason instanceof Error ? reason.message : "coaching update failed";
        }
      }

      if (!attemptId) {
        setUnsavedAttempt({
          id: `unsaved-${crypto.randomUUID()}`,
          ts: new Date().toISOString(),
          exercise_type: proposal.spec?.type ?? "free_sing",
          exercise_spec_json: proposal.spec ? JSON.stringify(proposal.spec) : null,
          measurements_json: JSON.stringify(analysis.measurements),
          coaching_md: coaching ? coachingToMarkdown(coaching) : "",
          coaching_json: coaching ? JSON.stringify(coaching) : null,
          audio_key: audioKey,
          contour_json: JSON.stringify(analysis.contour),
          practice_session_id: bundle.practice.id,
          sequence_number: bundle.attempts.length + 1,
          parent_attempt_id: proposal.parentAttemptId,
          attempt_kind: proposal.retry ? "retry" : "initial",
        });
        setError(
          `Your analysis${coaching ? " and coaching are" : " is"} shown below, but this attempt was not saved: ${saveError}`,
        );
      }

      let loaded = attemptId ? await refresh() : bundle;
      if (attemptId && coaching && coachingSaveError) {
        loaded = {
          ...loaded,
          attempts: loaded.attempts.map((attempt) =>
            attempt.id === attemptId
              ? {
                  ...attempt,
                  coaching_md: coachingToMarkdown(coaching),
                  coaching_json: JSON.stringify(coaching),
                }
              : attempt,
          ),
        };
        setBundle(loaded);
        setError(
          `Your coaching is visible, but it was not saved to history: ${coachingSaveError}`,
        );
      }
      if (attemptId && coachingError) {
        setCoachingRetry({
          attemptId,
          measurements: analysis.measurements,
          spec: proposal.spec,
        });
        setError(`Your attempt was saved, but coaching failed: ${coachingError}`);
      }
      const completed = loaded.attempts.find((attempt) => attempt.id === attemptId);
      if (completed) {
        const nextContract = contractFromAttempt(
          loaded.practice.learning_contract_json!,
          completed,
        );
        await updateLearningContract(loaded.practice.id, nextContract);
        setBundle({
          ...loaded,
          practice: { ...loaded.practice, learning_contract_json: nextContract },
        });
      }
      setAccepted(false);
      setProposal({
        spec: proposal.spec,
        reason:
          "Try the same sound once more while the correction is fresh, or move on when you can hear the pattern yourself.",
        parentAttemptId: attemptId,
        retry: true,
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "This attempt could not be completed.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const retryCoaching = async () => {
    if (!coachingRetry || !bundle) return;
    setProcessing(true);
    setError(null);
    try {
      const sessions = await listSessions(30);
      const coaching = await coach(
        coachingRetry.measurements,
        coachingRetry.spec,
        toHistory(sessions.filter((row) => row.id !== coachingRetry.attemptId)),
        bundle.practice.id,
      );
      await updateSessionCoaching(coachingRetry.attemptId, coaching);
      setCoachingRetry(null);
      const loaded = await refresh();
      const completed = loaded.attempts.find(
        (attempt) => attempt.id === coachingRetry.attemptId,
      );
      if (completed && loaded.practice.learning_contract_json) {
        const nextContract = contractFromAttempt(
          loaded.practice.learning_contract_json,
          completed,
        );
        await updateLearningContract(loaded.practice.id, nextContract);
        setBundle({
          ...loaded,
          practice: { ...loaded.practice, learning_contract_json: nextContract },
        });
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Coaching could not be retried.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const differentExercise = async () => {
    if (!bundle) return;
    let calibration;
    try {
      calibration = await latestCalibration();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load calibration.");
      return;
    }
    if (!calibration || calibration.tessitura_low_midi === null) {
      setNeedsCalibration(true);
      return;
    }
    const current = proposal?.spec;
    const spec = current
      ? skipExercise(calibration, bundle.attempts.length, current).spec
      : nextExercise(calibration, bundle.attempts.length, null);
    setNeedsCalibration(false);
    setAccepted(false);
    setProposal({
      spec,
      reason: "A different shape, while keeping today’s listening focus in view.",
      parentAttemptId: null,
      retry: false,
    });
  };

  const nextFromCoach = async () => {
    if (!bundle) return;
    let calibration;
    try {
      calibration = await latestCalibration();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load calibration.");
      return;
    }
    if (!calibration || calibration.tessitura_low_midi === null) {
      setNeedsCalibration(true);
      return;
    }
    const latest = bundle.attempts.at(-1);
    let spec = nextExercise(
      calibration,
      bundle.attempts.length,
      contract?.focusArea ?? null,
    );
    setNeedsCalibration(false);
    if (latest?.coaching_json) {
      const coaching = parseStoredJson(latest.coaching_json, coachingResponseSchema);
      if (coaching) {
        if (coaching.resolved?.drill?.exercise_type) {
          spec = exerciseForDrill(
            calibration,
            bundle.attempts.length,
            coaching.resolved.drill.exercise_type,
            coaching.resolved.drill.name,
          );
        }
      }
    }
    setAccepted(false);
    setProposal({
      spec,
      reason:
        "The next exercise keeps the same focus but changes what your voice has to coordinate.",
      parentAttemptId: null,
      retry: false,
    });
  };

  const freeSing = () => {
    setNeedsCalibration(false);
    setAccepted(false);
    setProposal({
      spec: null,
      reason:
        "Sing something familiar. We will listen for the current pattern without scoring target notes.",
      parentAttemptId: null,
      retry: false,
    });
  };

  const finish = async () => {
    if (!bundle || !contract) {
      setError("This practice is missing its coaching plan and cannot be ended safely.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      await endPractice(bundle.practice.id, bundle.attempts, contract);
      setEndOpen(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not end practice.");
    } finally {
      setProcessing(false);
    }
  };

  if (!bundle) {
    return (
      <Stack gap={4}>
        <LoadingSurface lines={2} />
        <Grid templateColumns={{ base: "1fr", lg: "2fr 1fr" }} gap={6}>
          <LoadingSurface lines={7} />
          <LoadingSurface lines={5} />
        </Grid>
      </Stack>
    );
  }

  return (
    <Stack gap={6} pb={ended ? 0 : "8rem"}>
      <Flex
        justify="space-between"
        align={{ base: "start", md: "center" }}
        gap={4}
        wrap="wrap"
      >
        <Box>
          <Flex gap={3} align="center">
            <Text color="cream.600" fontSize="sm">
              Practice
            </Text>
            <StatusLabel status={ended ? "ended" : "in_progress"} />
          </Flex>
          <Heading
            mt={2}
            fontSize={{ base: "2rem", md: "2.75rem" }}
            letterSpacing="-0.04em"
          >
            {ended ? "Practice review" : "Stay with one useful change."}
          </Heading>
          <Text mt={2} color="cream.700">
            {bundle.attempts.length} attempt{bundle.attempts.length === 1 ? "" : "s"} ·
            started {formatDate(bundle.practice.started_at)}
          </Text>
        </Box>
        {ended ? (
          <Button
            variant="outline"
            colorPalette="coral"
            onClick={() => router.push("/practice")}
          >
            Back to Practice
          </Button>
        ) : (
          <Button
            variant="ghost"
            colorPalette="coral"
            disabled={processing}
            onClick={() => setEndOpen(true)}
          >
            End practice
          </Button>
        )}
      </Flex>

      {error ? (
        <AppNotice tone="danger" title="Practice needs attention">
          {error}
          {coachingRetry ? (
            <Button mt={3} size="sm" variant="outline" onClick={retryCoaching}>
              Retry coaching
            </Button>
          ) : null}
        </AppNotice>
      ) : null}

      {needsCalibration && !ended ? (
        <AppNotice tone="warning" title="Calibrate before guided exercises">
          Guided exercises need your comfortable range. Free Sing works without it.
          <Flex mt={3} gap={3} wrap="wrap">
            <Button
              size="sm"
              colorPalette="coral"
              onClick={() => router.push("/calibrate")}
            >
              Calibrate my range
            </Button>
            <Button size="sm" variant="outline" onClick={freeSing}>
              Free sing instead
            </Button>
          </Flex>
        </AppNotice>
      ) : null}

      <Grid
        templateColumns={{
          base: "minmax(0, 1fr)",
          lg: "minmax(0, 1.85fr) minmax(17rem, .75fr)",
        }}
        gap={6}
        alignItems="start"
      >
        <Stack gap={5}>
          <SessionOrigin direction={bundle.practice.starting_direction} />
          {bundle.attempts.map((attempt, index) => {
            const parent = attempt.parent_attempt_id
              ? bundle.attempts.find((row) => row.id === attempt.parent_attempt_id)
              : null;
            return (
              <AttemptResult
                key={attempt.id}
                attempt={attempt}
                number={index + 1}
                parent={parent ?? null}
                expanded={Boolean(details[attempt.id])}
                onToggle={() =>
                  setDetails((current) => ({
                    ...current,
                    [attempt.id]: !current[attempt.id],
                  }))
                }
                onAsk={(label, value) => askAbout(label, value, attempt.id)}
              />
            );
          })}
          {unsavedAttempt ? (
            <Box borderWidth="2px" borderColor="coral.400" rounded="surface" p={1}>
              <Badge m={3} mb={1} colorPalette="coral" variant="subtle">
                Not saved to history
              </Badge>
              <AttemptResult
                attempt={unsavedAttempt}
                number={bundle.attempts.length + 1}
                parent={null}
                expanded={Boolean(details[unsavedAttempt.id])}
                onToggle={() =>
                  setDetails((current) => ({
                    ...current,
                    [unsavedAttempt.id]: !current[unsavedAttempt.id],
                  }))
                }
                onAsk={(label, value) => askAbout(label, value, bundle.practice.id)}
              />
            </Box>
          ) : null}
          <PracticeConversation
            messages={bundle.messages}
            streamingText={streamingText}
            anchor={anchor}
          />
          {!ended && proposal ? (
            <ExerciseProposal
              proposal={proposal}
              accepted={accepted}
              processing={processing}
              playing={playing}
              onAccept={() => setAccepted(true)}
              onUploaded={onUploaded}
              onHear={async () => {
                if (!proposal.spec) return;
                setPlaying(true);
                await playSequence(
                  proposal.spec.target_notes_midi,
                  proposal.spec.duration_per_note_s,
                ).done;
                setPlaying(false);
              }}
              onDifferent={differentExercise}
              onFreeSing={freeSing}
              onMoveOn={nextFromCoach}
              onAsk={() =>
                askAbout(
                  "Exercise",
                  proposal.spec?.display_name ?? "Free sing",
                  bundle.practice.id,
                  "exercise_instruction",
                )
              }
            />
          ) : null}
          {ended ? (
            <Box borderTopWidth="1px" borderColor="grid" py={6}>
              <Text color="cream.600">
                This practice has ended. Its attempts and explanations are preserved as
                they happened.
              </Text>
            </Box>
          ) : null}
        </Stack>

        {contract ? (
          <PracticeCompass
            contract={contract}
            onAsk={(label, value) =>
              askAbout(label, value, bundle.practice.id, "compass_field")
            }
          />
        ) : null}
      </Grid>

      {!ended ? (
        <PracticeComposer
          value={question}
          onChange={setQuestion}
          anchor={anchor}
          onClearAnchor={() => setAnchor(null)}
          onSend={sendQuestion}
          onDifferent={differentExercise}
          onFreeSing={freeSing}
          streaming={streaming}
          disabled={processing}
          onStop={() => abortRef.current?.abort()}
        />
      ) : null}

      <Dialog.Root open={endOpen} onOpenChange={(event) => setEndOpen(event.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content rounded="xl">
            <Dialog.Header>
              <Dialog.Title>End this practice?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text color="cream.700">
                This session will become read-only. You can review it later, but you will
                not be able to add attempts or questions.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="ghost">Keep practicing</Button>
              </Dialog.ActionTrigger>
              <Button colorPalette="coral" onClick={finish} loading={processing}>
                End practice
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Stack>
  );
}

function SessionOrigin({ direction }: { direction: string }) {
  return (
    <Flex gap={3} align="center" color="cream.600" fontSize="sm">
      <Box h="1px" flex="1" bg="grid" />
      <Text>Practice started · {direction.replaceAll("_", " ")}</Text>
      <Box h="1px" flex="1" bg="grid" />
    </Flex>
  );
}

function chooseProposalSpec(
  bundle: PracticeBundle,
  calibration: NonNullable<Awaited<ReturnType<typeof latestCalibration>>>,
): ExerciseSpec | null {
  if (bundle.practice.starting_direction === "free_sing") return null;
  return nextExercise(
    calibration,
    bundle.attempts.length,
    bundle.practice.learning_contract_json?.focusArea ?? null,
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
