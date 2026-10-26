"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Link as ChakraLink,
  Stack,
  Text,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttemptResult } from "@/components/practice/AttemptResult";
import { PracticeComposer } from "@/components/practice/PracticeComposer";
import {
  PracticeMessage,
  StreamingPracticeMessage,
} from "@/components/practice/PracticeConversation";
import { AppNotice } from "@/components/ui/AppNotice";
import { LoadingSurface } from "@/components/ui/LoadingSurface";
import { Surface } from "@/components/ui/Surface";
import { streamPracticeCoach } from "@/lib/api";
import {
  attemptExerciseName,
  attemptNavigationLabel,
  loadPractice,
  savePracticeMessage,
  type PracticeBundle,
  type PracticeMessageRow,
  type PracticeSessionRow,
} from "@/lib/practice";
import { messagesForAttempt } from "@/lib/practiceWorkspace";
import type { ContextAnchor } from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";

type AttemptDetailViewProps = {
  practice: PracticeSessionRow;
  attempt: SessionRow;
  parent: SessionRow | null;
  messages: PracticeMessageRow[];
  expanded: boolean;
  chatOpen: boolean;
  question: string;
  anchor: ContextAnchor | null;
  streamingText: string;
  streaming: boolean;
  onToggleAnalysis: () => void;
  onOpenChat: () => void;
  onQuestionChange: (value: string) => void;
  onClearAnchor: () => void;
  onSend: () => void;
  onStop: () => void;
  onAsk: (label: string, value: string) => void;
};

export function AttemptDetailView(props: AttemptDetailViewProps) {
  const ended = props.practice.status === "ended";
  const index = Math.max(0, (props.attempt.sequence_number ?? 1) - 1);
  return (
    <Stack gap={6}>
      <Surface
        as="nav"
        aria-label="Attempt navigation"
        position="sticky"
        top={{ base: 0, md: "4.5rem" }}
        zIndex="sticky"
        px={4}
        py={3}
        bg="bg.overlay"
        backdropFilter="blur(14px)"
      >
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <ChakraLink
            asChild
            color="action.primary"
            fontWeight="semibold"
            minH="12"
            display="inline-flex"
            alignItems="center"
          >
            <NextLink href={`/practice/${props.practice.id}`}>
              ← Back to practice
            </NextLink>
          </ChakraLink>
          {!ended ? (
            <Button asChild colorPalette="coral" minH="12">
              <NextLink
                href={`/practice/${props.practice.id}?retry=${props.attempt.id}#practice-controls`}
              >
                Try again
              </NextLink>
            </Button>
          ) : null}
        </Flex>
      </Surface>

      <Box>
        <Text color="fg.muted">{attemptNavigationLabel(props.attempt, index)}</Text>
        <Heading mt={1} size="2xl">
          {attemptExerciseName(props.attempt)}
        </Heading>
      </Box>

      <AttemptResult
        attempt={props.attempt}
        fallbackIndex={index}
        parent={props.parent}
        expanded={props.expanded}
        onToggle={props.onToggleAnalysis}
        onAsk={ended ? undefined : props.onAsk}
      />

      {!ended ? (
        <Surface p={{ base: 5, md: 6 }}>
          <Heading size="lg">Ask about this attempt</Heading>
          <Text mt={2} color="fg.muted">
            Keep questions tied to what you heard, the coach’s explanation, or this
            analysis.
          </Text>
          {!props.chatOpen ? (
            <Button
              mt={4}
              variant="outline"
              colorPalette="coral"
              onClick={props.onOpenChat}
            >
              Ask about this attempt
            </Button>
          ) : (
            <Stack mt={5} gap={3}>
              {props.messages.map((message) => (
                <PracticeMessage key={message.id} message={message} />
              ))}
              <StreamingPracticeMessage
                text={props.streamingText}
                anchor={props.anchor}
              />
              <PracticeComposer
                value={props.question}
                onChange={props.onQuestionChange}
                anchor={props.anchor}
                onClearAnchor={props.onClearAnchor}
                onSend={props.onSend}
                onRetry={() => undefined}
                onDifferent={() => undefined}
                streaming={props.streaming}
                disabled={false}
                onStop={props.onStop}
                showPracticeActions={false}
                placeholder="Ask about this attempt"
              />
            </Stack>
          )}
        </Surface>
      ) : null}
    </Stack>
  );
}

export function AttemptDetail() {
  const params = useParams<{ id: string; attemptId: string }>();
  const [bundle, setBundle] = useState<PracticeBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [anchor, setAnchor] = useState<ContextAnchor | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const loaded = await loadPractice(params.id);
    setBundle(loaded);
    return loaded;
  }, [params.id]);

  useEffect(() => {
    void refresh().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Could not load this attempt."),
    );
    return () => abortRef.current?.abort();
  }, [refresh]);

  if (error) {
    return (
      <AppNotice tone="danger" title="Could not open this attempt">
        {error}
      </AppNotice>
    );
  }
  if (!bundle) return <LoadingSurface lines={8} />;
  const attempt = bundle.attempts.find((row) => row.id === params.attemptId) ?? null;
  if (!attempt) {
    return (
      <AppNotice tone="warning" title="Attempt not found">
        This attempt is not part of this practice.{" "}
        <ChakraLink asChild>
          <NextLink href={`/practice/${bundle.practice.id}`}>Back to practice</NextLink>
        </ChakraLink>
      </AppNotice>
    );
  }
  const parent = attempt.parent_attempt_id
    ? (bundle.attempts.find((row) => row.id === attempt.parent_attempt_id) ?? null)
    : null;
  const messages = messagesForAttempt(bundle.messages, attempt.id);

  const send = async () => {
    const text = question.trim();
    if (!text || streaming || bundle.practice.status === "ended") return;
    const userRequestId = crypto.randomUUID();
    const assistantRequestId = crypto.randomUUID();
    setStreaming(true);
    setQuestion("");
    setStreamingText("");
    try {
      const userMessage = await savePracticeMessage({
        practiceSessionId: bundle.practice.id,
        attemptId: attempt.id,
        role: "user",
        text,
        contextAnchor: anchor,
        clientRequestId: userRequestId,
      });
      setBundle((current) =>
        current ? { ...current, messages: [...current.messages, userMessage] } : current,
      );
      const controller = new AbortController();
      abortRef.current = controller;
      await streamPracticeCoach(
        bundle.practice.id,
        attempt.id,
        text,
        anchor,
        assistantRequestId,
        userMessage.id,
        (delta) => setStreamingText((current) => current + delta),
        controller.signal,
      );
      await refresh();
      setAnchor(null);
    } catch (reason) {
      if ((reason as { name?: string }).name !== "AbortError") {
        setError(
          reason instanceof Error ? reason.message : "The coach could not respond.",
        );
      }
      await refresh().catch(() => undefined);
    } finally {
      abortRef.current = null;
      setStreamingText("");
      setStreaming(false);
    }
  };

  return (
    <AttemptDetailView
      practice={bundle.practice}
      attempt={attempt}
      parent={parent}
      messages={messages}
      expanded={expanded}
      chatOpen={chatOpen || messages.length > 0}
      question={question}
      anchor={anchor}
      streamingText={streamingText}
      streaming={streaming}
      onToggleAnalysis={() => setExpanded((value) => !value)}
      onOpenChat={() => setChatOpen(true)}
      onQuestionChange={setQuestion}
      onClearAnchor={() => setAnchor(null)}
      onSend={() => void send()}
      onStop={() => abortRef.current?.abort()}
      onAsk={(label, value) => {
        setChatOpen(true);
        setAnchor({ kind: "coaching_text", label, value, sourceId: attempt.id });
        requestAnimationFrame(() =>
          document.getElementById("practice-question")?.focus(),
        );
      }}
    />
  );
}
