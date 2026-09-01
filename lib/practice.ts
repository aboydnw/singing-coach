import { z } from "zod";
import {
  compassModelSchema,
  exerciseSpecSchema,
  measurementsSchema,
  type ContextAnchor,
  type ExerciseSpec,
  type LearningContract,
  type StartingDirection,
} from "@/lib/schema";
import type { SessionRow } from "@/lib/sessions";
import { parseStoredJson } from "@/lib/storedJson";

const contractCoachingSchema = z
  .object({
    focus_area: z.string().optional(),
    top_issue: z.string().optional(),
    why: z.string().optional(),
    drill: z.string().optional(),
    encouragement: z.string().optional(),
    compass: compassModelSchema.optional(),
    resolved: z
      .object({
        cues: z.array(z.string()).optional(),
        caution: z.string().nullable().optional(),
      })
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "coaching must include at least one recognized field",
  );
import { supabase, userId } from "@/lib/supabase";

export type PracticeStatus = "in_progress" | "ended";

export type PracticeSessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  status: PracticeStatus;
  starting_direction: StartingDirection;
  learning_contract_json: LearningContract | null;
  summary_json: PracticeSummary | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSummary = {
  attemptCount: number;
  focus: string;
  strength: string | null;
  change: string | null;
};

export type PracticeMessageRow = {
  id: string;
  practice_session_id: string;
  attempt_id: string | null;
  user_id: string;
  role: "user" | "assistant";
  content_json: { text: string };
  context_anchor_json: ContextAnchor | null;
  status: "pending" | "streaming" | "complete" | "failed" | "stopped";
  client_request_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type PracticeBundle = {
  practice: PracticeSessionRow;
  attempts: SessionRow[];
  messages: PracticeMessageRow[];
};

export const STARTING_DIRECTION_LABELS: Record<StartingDirection, string> = {
  coach_pick: "Coach’s pick",
  pitch: "Pitch",
  steadiness: "Steadiness",
  tone: "Tone",
  free_sing: "Free sing",
};

export async function activePractice(): Promise<PracticeSessionRow | null> {
  const { data, error } = await supabase()
    .from("practice_sessions")
    .select("*")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PracticeSessionRow | null;
}

export async function listPractices(limit = 20): Promise<PracticeSessionRow[]> {
  const { data, error } = await supabase()
    .from("practice_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PracticeSessionRow[];
}

export async function createPractice(
  startingDirection: StartingDirection,
): Promise<PracticeSessionRow> {
  const uid = await userId();
  if (!uid) throw new Error("not signed in");
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: uid,
    started_at: now,
    status: "in_progress" as const,
    starting_direction: startingDirection,
    learning_contract_json: initialContract(startingDirection),
    updated_at: now,
  };
  const { data, error } = await supabase()
    .from("practice_sessions")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PracticeSessionRow;
}

export async function loadPractice(id: string): Promise<PracticeBundle> {
  const [practiceResult, attemptsResult, messagesResult] = await Promise.all([
    supabase().from("practice_sessions").select("*").eq("id", id).single(),
    supabase()
      .from("sessions")
      .select(
        "id, ts, exercise_type, exercise_spec_json, measurements_json, coaching_md, coaching_json, audio_key, contour_json, practice_session_id, sequence_number, parent_attempt_id, attempt_kind",
      )
      .eq("practice_session_id", id)
      .order("sequence_number", { ascending: true })
      .order("ts", { ascending: true })
      .order("id", { ascending: true }),
    supabase()
      .from("practice_messages")
      .select("*")
      .eq("practice_session_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (practiceResult.error) throw new Error(practiceResult.error.message);
  if (attemptsResult.error) throw new Error(attemptsResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);
  return {
    practice: practiceResult.data as PracticeSessionRow,
    attempts: (attemptsResult.data ?? []) as SessionRow[],
    messages: (messagesResult.data ?? []) as PracticeMessageRow[],
  };
}

export async function savePracticeMessage(args: {
  practiceSessionId: string;
  attemptId: string;
  role: "user" | "assistant";
  text: string;
  contextAnchor?: ContextAnchor | null;
  status?: PracticeMessageRow["status"];
  clientRequestId?: string | null;
}): Promise<PracticeMessageRow> {
  const uid = await userId();
  if (!uid) throw new Error("not signed in");
  const { data, error } = await supabase()
    .from("practice_messages")
    .insert({
      id: crypto.randomUUID(),
      practice_session_id: args.practiceSessionId,
      attempt_id: args.attemptId,
      user_id: uid,
      role: args.role,
      content_json: { text: args.text },
      context_anchor_json: args.contextAnchor ?? null,
      status: args.status ?? "complete",
      client_request_id: args.clientRequestId ?? null,
      completed_at: args.status === "streaming" ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PracticeMessageRow;
}

export function messagesForAttempt(
  messages: PracticeMessageRow[],
  attemptId: string,
): PracticeMessageRow[] {
  return messages.filter((message) => message.attempt_id === attemptId);
}

export function selectedAttemptAfterRefresh(
  currentId: string | null,
  attempts: SessionRow[],
  newlyCreatedId?: string | null,
): string | null {
  if (newlyCreatedId && attempts.some((attempt) => attempt.id === newlyCreatedId)) {
    return newlyCreatedId;
  }
  if (currentId && attempts.some((attempt) => attempt.id === currentId)) {
    return currentId;
  }
  return attempts.at(-1)?.id ?? null;
}

export function activePracticeThread(
  attempts: SessionRow[],
  messages: PracticeMessageRow[],
  selectedAttemptId: string | null,
): { attempt: SessionRow | null; messages: PracticeMessageRow[] } {
  if (!selectedAttemptId) return { attempt: null, messages: [] };
  const attempt = attempts.find((row) => row.id === selectedAttemptId) ?? null;
  if (!attempt) return { attempt: null, messages: [] };
  return {
    attempt,
    messages: messagesForAttempt(messages, attempt.id),
  };
}

export function attemptNavigationLabel(attempt: SessionRow, index: number): string {
  const number =
    typeof attempt.sequence_number === "number" && attempt.sequence_number > 0
      ? attempt.sequence_number
      : index + 1;
  const retry = attempt.attempt_kind === "retry" || Boolean(attempt.parent_attempt_id);
  return retry ? `Focused retry ${number}` : `Attempt ${number}`;
}

export function nextAttemptSequence(attempts: SessionRow[]): number {
  const highestPersisted = attempts.reduce(
    (highest, attempt) =>
      typeof attempt.sequence_number === "number" && attempt.sequence_number > highest
        ? attempt.sequence_number
        : highest,
    0,
  );
  return Math.max(attempts.length, highestPersisted) + 1;
}

export function currentExerciseForChange(
  setupOpen: boolean,
  proposalSpec: ExerciseSpec | null | undefined,
  selectedAttemptSpec: ExerciseSpec | null,
): ExerciseSpec | null {
  return setupOpen && proposalSpec !== undefined ? proposalSpec : selectedAttemptSpec;
}

export function attemptExerciseName(attempt: SessionRow): string {
  return (
    parseStoredJson(attempt.exercise_spec_json, exerciseSpecSchema)?.display_name ??
    "Free sing"
  );
}

export function attemptOutcome(attempt: SessionRow): string {
  const coaching = parseStoredJson(attempt.coaching_json, contractCoachingSchema);
  if (coaching?.top_issue) return shortenNavigationText(coaching.top_issue);
  const accuracy = parseStoredJson(attempt.measurements_json, measurementsSchema)
    ?.accuracy?.mean_abs_cents_off;
  if (typeof accuracy === "number") {
    return `${Math.round(accuracy)} cents off average`;
  }
  return attempt.coaching_json ? "Feedback available" : "Analysis saved";
}

function shortenNavigationText(value: string): string {
  const text = value.trim();
  if (text.length <= 88) return text;
  return `${text.slice(0, 85).trimEnd()}…`;
}

export async function updateLearningContract(
  id: string,
  contract: LearningContract,
): Promise<void> {
  const { error } = await supabase()
    .from("practice_sessions")
    .update({ learning_contract_json: contract, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "in_progress");
  if (error) throw new Error(error.message);
}

export async function endPractice(
  id: string,
  attempts: SessionRow[],
  contract: LearningContract,
): Promise<void> {
  const now = new Date().toISOString();
  const summary: PracticeSummary = {
    attemptCount: attempts.length,
    focus: contract.focus,
    strength: contract.strength,
    change: summarizeChange(attempts),
  };
  const { error } = await supabase()
    .from("practice_sessions")
    .update({
      status: "ended",
      ended_at: now,
      updated_at: now,
      learning_contract_json: contract,
      summary_json: summary,
    })
    .eq("id", id)
    .eq("status", "in_progress");
  if (error) throw new Error(error.message);
}

export function initialContract(direction: StartingDirection): LearningContract {
  const presets: Record<
    StartingDirection,
    Pick<LearningContract, "focus" | "listenFor" | "tryCue" | "readyWhen">
  > = {
    coach_pick: {
      focus: "Find one useful pattern to work on",
      listenFor: "What feels repeatable and what changes between attempts",
      tryCue: "Make the sound easy to notice, not perfect",
      readyWhen: "The first attempt gives us a clear pattern",
    },
    pitch: {
      focus: "Land cleanly on the target pitch",
      listenFor: "A note that begins at its destination instead of sliding toward it",
      tryCue: "Place the note on a shelf across the room",
      readyWhen: "Two starts arrive near the target without a corrective slide",
    },
    steadiness: {
      focus: "Keep the sound even from beginning to end",
      listenFor: "A tone that does not wobble or fade unexpectedly",
      tryCue: "Send one unbroken ribbon of sound across the room",
      readyWhen: "Two attempts keep a similar shape throughout the note",
    },
    tone: {
      focus: "Find a clear, consistent tone",
      listenFor: "The same vowel color from the start of the note to the end",
      tryCue: "Aim the vowel toward the far wall",
      readyWhen: "The vowel remains recognizable across two attempts",
    },
    free_sing: {
      focus: "Notice what your voice naturally does today",
      listenFor: "A moment that feels easy and a moment that asks for more effort",
      tryCue: "Sing something familiar without trying to fix it yet",
      readyWhen: "You have a passage worth exploring more closely",
    },
  };
  return {
    focusArea:
      direction === "pitch"
        ? "pitch_accuracy"
        : direction === "steadiness"
          ? "breath_support"
          : direction === "tone"
            ? "tone_quality"
            : null,
    ...presets[direction],
    avoid: null,
    strength: null,
    updatedAfterAttemptId: null,
    confidence: "early",
  };
}

export function contractFromAttempt(
  prior: LearningContract,
  attempt: SessionRow,
): LearningContract {
  if (!attempt.coaching_json) return prior;
  const coaching = parseStoredJson(attempt.coaching_json, contractCoachingSchema);
  if (coaching) {
    return {
      focusArea: coaching.focus_area ?? prior.focusArea,
      focus: coaching.top_issue ?? prior.focus,
      listenFor: coaching.why ?? prior.listenFor,
      tryCue: coaching.resolved?.cues?.[0] ?? coaching.drill ?? prior.tryCue,
      avoid: coaching.resolved?.caution ?? null,
      strength: coaching.encouragement ?? prior.strength,
      readyWhen: readinessFor(coaching.focus_area),
      updatedAfterAttemptId: attempt.id,
      confidence: "developing",
      compass: coaching.compass
        ? {
            overallTrend: coaching.compass.overall_trend,
            currentSession: coaching.compass.current_session,
            nextDirection: coaching.compass.next_direction,
          }
        : prior.compass,
    };
  }
  return prior;
}

export function compassForContract(contract: LearningContract) {
  if (contract.compass) return contract.compass;
  return {
    overallTrend:
      contract.confidence === "early"
        ? "I’m still learning your usual pattern across practices."
        : "Your longer-term trend will become clearer with more practice evidence.",
    currentSession: contract.strength
      ? shortenCompassSentence(contract.strength)
      : shortenCompassSentence(`This practice is focusing on ${contract.focus}.`),
    nextDirection: shortenCompassSentence(contract.tryCue),
  };
}

function shortenCompassSentence(value: string): string {
  const sentence = value.trim();
  if (sentence.length <= 180) return sentence;
  return `${sentence.slice(0, 177).trimEnd()}…`;
}

function readinessFor(focus: string | undefined): string {
  if (focus === "pitch_accuracy")
    return "Two attempts land closer to the target without a corrective slide";
  if (focus === "breath_support")
    return "Two attempts keep a similar pitch and volume shape from start to finish";
  if (focus === "tone_quality")
    return "The vowel stays clear and recognizable across two attempts";
  if (focus === "vibrato")
    return "The oscillation feels intentional and repeats at a similar rate";
  return "You can hear the pattern yourself and reproduce the change twice";
}

function summarizeChange(attempts: SessionRow[]): string | null {
  const cents = attempts
    .map((attempt) => {
      return parseStoredJson(attempt.measurements_json, measurementsSchema)?.accuracy
        ?.mean_abs_cents_off;
    })
    .filter((value): value is number => typeof value === "number");
  if (cents.length < 2) return null;
  const delta = Math.round(cents[0] - cents[cents.length - 1]);
  if (Math.abs(delta) < 3)
    return "Pitch accuracy stayed broadly consistent within the practice";
  return delta > 0
    ? `The final scored attempt was ${delta} cents closer on average than the first`
    : `The final scored attempt was ${Math.abs(delta)} cents farther away on average than the first`;
}
