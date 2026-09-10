import { exerciseForDrill, nextExercise } from "@/lib/exercises";
import { exerciseSpecSchema } from "@/lib/schema";
import type { Calibration, ExerciseSpec, FocusArea } from "@/lib/schema";

type ExerciseHistoryRow = {
  exercise_spec_json: string | null;
  practice_session_id?: string | null;
};

export type VariedExerciseArgs = {
  calibration: Calibration;
  cursor: number;
  focusArea: FocusArea | null;
  preferredType?: ExerciseSpec["type"] | null;
  drillName?: string | null;
  history: ExerciseHistoryRow[];
};

type Candidate = {
  spec: ExerciseSpec;
  index: number;
  relevance: number;
};

const CANDIDATE_COUNT = 16;
const RECENT_HISTORY_COUNT = 12;
const HARD_EXCLUSION_COUNT = 2;

export function exerciseSignature(spec: ExerciseSpec): string {
  return `${spec.type}:${spec.target_notes_midi.join(",")}:${spec.vowel}`;
}

export function selectVariedExercise(args: VariedExerciseArgs): {
  spec: ExerciseSpec;
  index: number;
} {
  const recent = parseRecentSpecs(args.history).slice(0, RECENT_HISTORY_COUNT);
  const hardExcluded = new Set(
    recent.slice(0, HARD_EXCLUSION_COUNT).map(exerciseSignature),
  );
  const candidates = buildCandidates(args);
  const eligible = candidates.filter(
    ({ spec }) => !hardExcluded.has(exerciseSignature(spec)),
  );
  const ranked = (eligible.length > 0 ? eligible : candidates).sort(
    (a, b) => score(b, recent) - score(a, recent) || a.index - b.index,
  );
  return { spec: ranked[0].spec, index: ranked[0].index };
}

function parseRecentSpecs(history: ExerciseHistoryRow[]): ExerciseSpec[] {
  const specs: ExerciseSpec[] = [];
  for (const row of history) {
    if (!row.exercise_spec_json) continue;
    try {
      const parsed = exerciseSpecSchema.safeParse(JSON.parse(row.exercise_spec_json));
      if (parsed.success) specs.push(parsed.data);
    } catch {
      // A malformed historical row should not prevent the next safe proposal.
    }
  }
  return specs;
}

function buildCandidates(args: VariedExerciseArgs): Candidate[] {
  const candidates = new Map<string, Candidate>();
  for (let step = 0; step < CANDIDATE_COUNT; step += 1) {
    const index = args.cursor + step;
    if (args.preferredType) {
      addCandidate(
        candidates,
        exerciseForDrill(
          args.calibration,
          index,
          args.preferredType,
          args.drillName ?? args.preferredType,
        ),
        index,
        100,
      );
    }
    if (args.focusArea) {
      addCandidate(
        candidates,
        nextExercise(args.calibration, index, args.focusArea),
        index,
        60,
      );
    }
    addCandidate(candidates, nextExercise(args.calibration, index, null), index, 0);
  }
  return [...candidates.values()];
}

function addCandidate(
  candidates: Map<string, Candidate>,
  spec: ExerciseSpec,
  index: number,
  relevance: number,
) {
  const signature = exerciseSignature(spec);
  const current = candidates.get(signature);
  if (!current || relevance > current.relevance) {
    candidates.set(signature, { spec, index, relevance });
  }
}

function score(candidate: Candidate, recent: ExerciseSpec[]): number {
  const signature = exerciseSignature(candidate.spec);
  const exactUses = recent.filter((spec) => exerciseSignature(spec) === signature).length;
  const typeUses = recent.filter((spec) => spec.type === candidate.spec.type).length;
  return candidate.relevance - exactUses * 40 - typeUses * 12;
}
