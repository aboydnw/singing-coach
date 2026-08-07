"use client";

import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Grid,
  Heading,
  Input,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Drill } from "@/components/Drill";
import { HearItRight } from "@/components/HearItRight";
import { PitchChart } from "@/components/PitchChart";
import { Recorder } from "@/components/Recorder";
import { Scorecard } from "@/components/Scorecard";
import { analyze, coach, streamPracticeCoach } from "@/lib/api";
import { exerciseForDrill, nextExercise, skipExercise } from "@/lib/exercises";
import {
  contractFromAttempt,
  endPractice,
  loadPractice,
  savePracticeMessage,
  updateLearningContract,
  type PracticeBundle,
  type PracticeMessageRow,
} from "@/lib/practice";
import type {
  ContextAnchor,
  ExerciseSpec,
  LearningContract,
  Measurements,
} from "@/lib/schema";
import {
  bestPriorTake,
  insertSession,
  latestCalibration,
  listSessions,
  toHistory,
  updateSessionCoaching,
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
        const calibration = await latestCalibration();
        if (!calibration || calibration.tessitura_low_midi === null) return;
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
    const clientRequestId = crypto.randomUUID();
    setStreaming(true);
    setStreamingText("");
    setQuestion("");
    try {
      const userMessage = await savePracticeMessage({
        practiceSessionId: bundle.practice.id,
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
        text,
        anchor,
        (delta) => setStreamingText((current) => current + delta),
        controller.signal,
      );
      const assistant = await savePracticeMessage({
        practiceSessionId: bundle.practice.id,
        role: "assistant",
        text: answer,
        contextAnchor: anchor,
        status: "complete",
      });
      setBundle((current) =>
        current ? { ...current, messages: [...current.messages, assistant] } : current,
      );
      setAnchor(null);
      setStreamingText("");
    } catch (reason) {
      if ((reason as { name?: string })?.name !== "AbortError") {
        setError(
          reason instanceof Error ? reason.message : "The coach could not respond.",
        );
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const onUploaded = async (audioKey: string) => {
    if (!bundle || !proposal) return;
    setProcessing(true);
    setError(null);
    try {
      const analysis = await analyze(audioKey, proposal.spec, "full");
      if (!analysis.measurements) throw new Error("Analysis returned no measurements.");
      const allSessions = await listSessions();
      const attemptId = await insertSession({
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
      const coaching = await coach(
        analysis.measurements,
        proposal.spec,
        toHistory(allSessions.filter((row) => row.id !== attemptId)),
      );
      await updateSessionCoaching(attemptId, coaching);
      const loaded = await refresh();
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

  const differentExercise = async () => {
    if (!bundle) return;
    const calibration = await latestCalibration();
    if (!calibration || calibration.tessitura_low_midi === null) return;
    const current = proposal?.spec;
    const spec = current
      ? skipExercise(calibration, bundle.attempts.length, current).spec
      : nextExercise(calibration, bundle.attempts.length, null);
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
    const calibration = await latestCalibration();
    if (!calibration || calibration.tessitura_low_midi === null) return;
    const latest = bundle.attempts.at(-1);
    let spec = nextExercise(
      calibration,
      bundle.attempts.length,
      contract?.focusArea ?? null,
    );
    if (latest?.coaching_json) {
      try {
        const coaching = JSON.parse(latest.coaching_json);
        if (coaching.resolved?.drill?.exercise_type) {
          spec = exerciseForDrill(
            calibration,
            bundle.attempts.length,
            coaching.resolved.drill.exercise_type,
            coaching.resolved.drill.name,
          );
        }
      } catch {
        // Deterministic focus-based proposal is already available.
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
    if (!bundle || !contract) return;
    await endPractice(bundle.practice.id, bundle.attempts, contract);
    setEndOpen(false);
    await refresh();
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
              <Button colorPalette="coral" onClick={finish}>
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

function LegacyExerciseProposal(props: {
  proposal: PracticeProposal;
  accepted: boolean;
  processing: boolean;
  playing: boolean;
  onAccept: () => void;
  onUploaded: (key: string) => void;
  onHear: () => void;
  onDifferent: () => void;
  onFreeSing: () => void;
  onMoveOn: () => void;
  onAsk: () => void;
}) {
  const { proposal, accepted } = props;
  return (
    <Box
      as="article"
      bg="panel"
      borderWidth="1px"
      borderColor={accepted ? "coral.300" : "grid"}
      borderLeftWidth="4px"
      borderLeftColor="coral.400"
      rounded="xl"
      p={{ base: 5, md: 6 }}
      boxShadow={accepted ? "active" : "none"}
    >
      <Text color="coral.600" fontSize="xs" fontWeight="semibold" letterSpacing="0.08em">
        {proposal.retry ? "FOCUSED RETRY" : "NEXT EXERCISE"}
      </Text>
      <Heading mt={2} size="lg">
        {proposal.spec?.display_name ?? "Free sing"}
      </Heading>
      <Text mt={2} color="cream.700" lineHeight="1.7">
        {proposal.reason}
      </Text>
      {proposal.spec ? (
        <Text mt={3} fontSize="sm" color="cream.600">
          {proposal.spec.target_notes_midi.length} note
          {proposal.spec.target_notes_midi.length === 1 ? "" : "s"} · “
          {proposal.spec.vowel}” · {proposal.spec.duration_per_note_s}s each
        </Text>
      ) : (
        <Text mt={3} fontSize="sm" color="cream.600">
          No target notes. Pitch accuracy will not be scored.
        </Text>
      )}

      {!accepted ? (
        <Stack mt={5} gap={3}>
          <Flex gap={3} wrap="wrap">
            <Button colorPalette="coral" onClick={props.onAccept}>
              {proposal.retry ? "Try it now" : "Start this exercise"}
            </Button>
            {proposal.spec ? (
              <Button
                variant="outline"
                colorPalette="teal"
                onClick={props.onHear}
                loading={props.playing}
              >
                Hear it
              </Button>
            ) : null}
          </Flex>
          <Flex gap={4} wrap="wrap">
            <Button variant="plain" color="cream.700" px={0} onClick={props.onAsk}>
              Ask about this
            </Button>
            <Button variant="plain" color="cream.700" px={0} onClick={props.onDifferent}>
              Different exercise
            </Button>
            {proposal.spec ? (
              <Button variant="plain" color="cream.700" px={0} onClick={props.onFreeSing}>
                Free sing instead
              </Button>
            ) : (
              <Button variant="plain" color="cream.700" px={0} onClick={props.onMoveOn}>
                Coach’s exercise instead
              </Button>
            )}
            {proposal.retry ? (
              <Button variant="plain" color="coral.600" px={0} onClick={props.onMoveOn}>
                Move on
              </Button>
            ) : null}
          </Flex>
        </Stack>
      ) : (
        <Stack mt={5} gap={4} bg="cream.100" rounded="lg" p={4}>
          <Text fontWeight="semibold">
            Keep one cue in mind, then record when you are ready.
          </Text>
          {proposal.spec ? (
            <Button
              alignSelf="start"
              variant="outline"
              colorPalette="teal"
              onClick={props.onHear}
              loading={props.playing}
            >
              Hear the reference
            </Button>
          ) : null}
          <Recorder onUploaded={props.onUploaded} disabled={props.processing} />
          {props.processing ? (
            <Text color="teal.700">
              Listening for the pattern and preparing one useful correction…
            </Text>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}

function LegacyAttemptResult(props: {
  attempt: SessionRow;
  number: number;
  parent: SessionRow | null;
  expanded: boolean;
  onToggle: () => void;
  onAsk: (label: string, value: string) => void;
}) {
  const coaching = parse(props.attempt.coaching_json);
  const measurements = parse(props.attempt.measurements_json) as Measurements | null;
  const contour = parse(props.attempt.contour_json);
  const spec = parse(props.attempt.exercise_spec_json) as ExerciseSpec | null;
  const parentCents = props.parent ? centsFrom(props.parent) : null;
  const currentCents = centsFrom(props.attempt);
  const delta =
    parentCents !== null && currentCents !== null
      ? Math.round(parentCents - currentCents)
      : null;
  return (
    <Box
      as="article"
      id={`attempt-${props.attempt.id}`}
      bg="panel"
      borderWidth="1px"
      borderColor="grid"
      rounded="xl"
      overflow="hidden"
      style={{ contentVisibility: "auto" }}
    >
      <Box p={{ base: 5, md: 6 }}>
        <Flex justify="space-between" gap={3} wrap="wrap">
          <Box>
            <Text color="cream.600" fontSize="sm">
              {props.parent ? "Focused retry" : `Attempt ${props.number}`}
            </Text>
            <Heading mt={1} size="md">
              {spec?.display_name ?? "Free sing"}
            </Heading>
          </Box>
          {delta !== null ? (
            <Badge colorPalette={delta > 0 ? "teal" : "gray"} variant="subtle">
              {delta > 0
                ? `${delta} cents closer`
                : delta < 0
                  ? `${Math.abs(delta)} cents farther`
                  : "Similar landing"}
            </Badge>
          ) : null}
        </Flex>
        {coaching ? (
          <Stack mt={5} gap={4}>
            <Box
              bg="coral.50"
              borderLeftWidth="3px"
              borderColor="coral.400"
              px={4}
              py={3}
            >
              <Text color="coral.700" fontSize="xs" fontWeight="semibold">
                ONE THING TO NOTICE
              </Text>
              <Text mt={1} fontWeight="semibold" fontSize="lg">
                {coaching.top_issue}
              </Text>
              <Text mt={2} color="cream.800" lineHeight="1.7">
                {coaching.why}
              </Text>
              <Button
                mt={2}
                variant="plain"
                color="coral.700"
                px={0}
                size="sm"
                onClick={() =>
                  props.onAsk(
                    "Coach’s correction",
                    `${coaching.top_issue}. ${coaching.why}`,
                  )
                }
              >
                Explain this
              </Button>
            </Box>
            <Box>
              <Text color="teal.700" fontSize="xs" fontWeight="semibold">
                STRENGTH
              </Text>
              <Text mt={1}>{coaching.encouragement}</Text>
            </Box>
          </Stack>
        ) : null}
        <Button
          mt={5}
          variant="outline"
          size="sm"
          colorPalette="teal"
          onClick={props.onToggle}
        >
          {props.expanded ? "Hide full analysis" : "View full analysis"}
        </Button>
      </Box>
      {props.expanded && measurements && contour ? (
        <Stack
          borderTopWidth="1px"
          borderColor="grid"
          p={{ base: 5, md: 6 }}
          gap={5}
          bg="cream.50"
        >
          <PitchChart contour={contour} spec={spec} ghost={null} />
          <Scorecard measurements={measurements} />
          {coaching?.resolved ? <Drill resolved={coaching.resolved} /> : null}
          {coaching?.resolved?.audible_correction && props.attempt.audio_key ? (
            <HearItRight
              audioKey={props.attempt.audio_key}
              correction={coaching.resolved.audible_correction}
            />
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}

function LegacyConversation({
  messages,
  streamingText,
  anchor,
}: {
  messages: PracticeMessageRow[];
  streamingText: string;
  anchor: ContextAnchor | null;
}) {
  if (messages.length === 0 && !streamingText) return null;
  return (
    <Stack gap={3}>
      {messages.map((message) => (
        <Box
          key={message.id}
          ml={message.role === "user" ? { base: 5, md: 16 } : 0}
          mr={message.role === "assistant" ? { base: 3, md: 10 } : 0}
          bg={message.role === "user" ? "teal.50" : "panel"}
          borderLeftWidth={message.context_anchor_json ? "3px" : "1px"}
          borderWidth="1px"
          borderLeftColor={message.context_anchor_json ? "teal.400" : "grid"}
          borderColor="grid"
          rounded="lg"
          px={4}
          py={3}
        >
          {message.context_anchor_json ? (
            <Text color="teal.700" fontSize="xs" fontWeight="semibold">
              ABOUT {message.context_anchor_json.label.toUpperCase()}
            </Text>
          ) : null}
          <Text mt={message.context_anchor_json ? 1 : 0} lineHeight="1.7">
            {message.content_json.text}
          </Text>
        </Box>
      ))}
      {streamingText ? (
        <Box
          mr={{ base: 3, md: 10 }}
          bg="panel"
          borderWidth="1px"
          borderColor="grid"
          rounded="lg"
          px={4}
          py={3}
        >
          {anchor ? (
            <Text color="teal.700" fontSize="xs" fontWeight="semibold">
              ABOUT {anchor.label.toUpperCase()}
            </Text>
          ) : null}
          <Text mt={anchor ? 1 : 0} lineHeight="1.7">
            {streamingText}
            <Box
              as="span"
              display="inline-block"
              w="2px"
              h="1em"
              bg="coral.500"
              ml="1"
              verticalAlign="middle"
            />
          </Text>
        </Box>
      ) : null}
    </Stack>
  );
}

function LegacyPracticeCompass({
  contract,
  onAsk,
}: {
  contract: LearningContract;
  onAsk: (label: string, value: string) => void;
}) {
  const fields = [
    ["Listen for", contract.listenFor],
    ["Try", contract.tryCue],
    ...(contract.avoid ? [["Avoid", contract.avoid]] : []),
    ["Strength", contract.strength ?? "We are still finding today’s reliable pattern."],
    ["Ready to move on when", contract.readyWhen],
  ];
  return (
    <Box
      as="aside"
      position={{ lg: "sticky" }}
      top={{ lg: "5.5rem" }}
      bg="cream.900"
      color="cream.50"
      rounded="2xl"
      p={{ base: 5, md: 6 }}
    >
      <Flex justify="space-between" align="center">
        <Text
          color="coral.200"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.09em"
        >
          PRACTICE COMPASS
        </Text>
        <Text color="cream.400" fontSize="xs">
          {contract.confidence}
        </Text>
      </Flex>
      <Box mt={6} pb={5} borderBottomWidth="1px" borderColor="cream.800">
        <Text color="cream.400" fontSize="xs">
          Today’s focus
        </Text>
        <Heading mt={2} size="md" color="cream.50" lineHeight="1.25">
          {contract.focus}
        </Heading>
        <Button
          mt={2}
          variant="plain"
          color="coral.200"
          px={0}
          size="xs"
          onClick={() => onAsk("Current focus", contract.focus)}
        >
          Ask about this
        </Button>
      </Box>
      <Stack mt={5} gap={5}>
        {fields.map(([label, value]) => (
          <Box key={label}>
            <Text color="cream.400" fontSize="xs">
              {label}
            </Text>
            <Text mt={1} lineHeight="1.55">
              {value}
            </Text>
            <Button
              variant="plain"
              color="cream.400"
              px={0}
              size="xs"
              onClick={() => onAsk(label, value)}
            >
              Explain
            </Button>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function LegacyPracticeComposer(props: {
  value: string;
  onChange: (value: string) => void;
  anchor: ContextAnchor | null;
  onClearAnchor: () => void;
  onSend: () => void;
  onDifferent: () => void;
  onFreeSing: () => void;
  streaming: boolean;
  disabled: boolean;
  onStop: () => void;
}) {
  return (
    <Box
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      zIndex="sticky"
      bg="bg.overlay"
      backdropFilter="blur(16px)"
      borderTopWidth="1px"
      borderColor="grid"
      py={3}
    >
      <Box maxW="6xl" mx="auto" px={{ base: 4, md: 6 }}>
        <Box
          maxW={{ lg: "calc((100% - 1.5rem) * .71)" }}
          bg="panel"
          borderWidth="1px"
          borderColor={props.anchor ? "teal.300" : "grid"}
          rounded="xl"
          px={3}
          py={2}
          boxShadow="overlay"
        >
          {props.anchor ? (
            <Flex gap={2} align="center" mb={2}>
              <Badge colorPalette="teal" variant="subtle">
                Asking about: {props.anchor.label}
              </Badge>
              <Button size="xs" variant="plain" onClick={props.onClearAnchor}>
                Remove
              </Button>
            </Flex>
          ) : null}
          <Flex gap={2} align="end">
            <Textarea
              id="practice-question"
              autoresize
              variant="flushed"
              placeholder={
                props.disabled
                  ? "Finish this attempt before asking the coach"
                  : "Ask about an exercise or something the coach said"
              }
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
              disabled={props.disabled || props.streaming}
              minH="10"
              maxH="28"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  props.onSend();
                }
              }}
            />
            {props.streaming ? (
              <Button variant="outline" colorPalette="coral" onClick={props.onStop}>
                Stop
              </Button>
            ) : (
              <Button
                colorPalette="coral"
                onClick={props.onSend}
                disabled={!props.value.trim() || props.disabled}
              >
                Send
              </Button>
            )}
          </Flex>
          <Flex gap={4} mt={1} wrap="wrap">
            <Button
              size="xs"
              variant="plain"
              px={0}
              color="cream.700"
              onClick={props.onDifferent}
              disabled={props.disabled}
            >
              Different exercise
            </Button>
            <Button
              size="xs"
              variant="plain"
              px={0}
              color="cream.700"
              onClick={props.onFreeSing}
              disabled={props.disabled}
            >
              Free sing
            </Button>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}

function chooseProposalSpec(
  bundle: PracticeBundle,
  calibration: NonNullable<Awaited<ReturnType<typeof latestCalibration>>>,
): ExerciseSpec | null {
  if (bundle.practice.starting_direction === "free_sing") return null;
  const directionFocus =
    bundle.practice.starting_direction === "pitch"
      ? "pitch_accuracy"
      : bundle.practice.starting_direction === "steadiness"
        ? "breath_support"
        : bundle.practice.starting_direction === "tone"
          ? "tone_quality"
          : (bundle.practice.learning_contract_json?.focusArea ?? null);
  return nextExercise(calibration, bundle.attempts.length, directionFocus);
}

function parse(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function centsFrom(attempt: SessionRow): number | null {
  const value = parse(attempt.measurements_json)?.accuracy?.mean_abs_cents_off;
  return typeof value === "number" ? value : null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
