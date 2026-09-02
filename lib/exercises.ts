/** Deterministic exercise generation, ported from exercises.py. Pure functions;
 * behaviour is pinned to the Python original by the shared parity fixture. */

import type { Calibration, ExerciseSpec, FocusArea } from "@/lib/schema";

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const TYPE_ROTATION = ["sustained", "scale", "arpeggio", "siren"] as const;

type ExerciseType = (typeof TYPE_ROTATION)[number];

const SHAPES: Record<ExerciseType, number[]> = {
  sustained: [0],
  scale: [0, 2, 4, 5, 7],
  arpeggio: [0, 4, 7, 12],
  siren: [0, 5, 12, 5, 0],
};

const DURATIONS: Record<ExerciseType, number> = {
  sustained: 3.0,
  scale: 0.5,
  arpeggio: 0.5,
  siren: 0.5,
};

const FOCUS_TO_TYPE: Record<string, ExerciseType> = {
  breath_support: "sustained",
  tone_quality: "sustained",
  vibrato: "sustained",
  pitch_accuracy: "scale",
  agility: "arpeggio",
  range: "siren",
};

const FOCUS_LABELS: Record<string, string> = {
  breath_support: "breath support",
  tone_quality: "tone quality",
  vibrato: "vibrato",
  pitch_accuracy: "pitch accuracy",
  agility: "agility",
  range: "range",
};

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

/** Two specs are the same drill when they share a type and target notes. The
 * display name is deliberately excluded: the coach's focus suffix changes it
 * without changing a single note the singer has to produce. */
export function isSameExercise(a: ExerciseSpec, b: ExerciseSpec): boolean {
  return (
    a.type === b.type &&
    a.target_notes_midi.length === b.target_notes_midi.length &&
    a.target_notes_midi.every((midi, i) => midi === b.target_notes_midi[i])
  );
}

/** The next exercise that is genuinely different from `current`, walking the
 * deterministic rotation forward from `fromIndex`.
 *
 * The coach's focus area is dropped on purpose. It pins the exercise type, so
 * honouring it here would keep handing back the drill the singer just asked to
 * skip. Stepping through TYPE_ROTATION covers every type, and only one of them
 * can match `current`, so a different exercise is always found. */
export function skipExercise(
  calibration: Calibration,
  fromIndex: number,
  current: ExerciseSpec,
): { spec: ExerciseSpec; index: number } {
  let candidate = {
    spec: nextExercise(calibration, fromIndex + 1, null),
    index: fromIndex + 1,
  };
  for (let step = 1; step <= TYPE_ROTATION.length; step++) {
    const index = fromIndex + step;
    candidate = { spec: nextExercise(calibration, index, null), index };
    if (!isSameExercise(candidate.spec, current)) break;
  }
  return candidate;
}

/** One step of the "try a different exercise" walk.
 *
 * `cursor` is the rotation position the last proposal landed on, not the
 * attempt count. Walking from the attempt count instead leaves the cursor
 * frozen while the singer skips, so the walk only ever reaches the next two
 * positions and bounces between the same pair of drills. Feeding the returned
 * index back in as the next `cursor` is what keeps the rotation moving. */
export function skipFromCursor(
  calibration: Calibration,
  cursor: number,
  current: ExerciseSpec | null,
): { spec: ExerciseSpec; index: number } {
  return current
    ? skipExercise(calibration, cursor, current)
    : { spec: nextExercise(calibration, cursor, null), index: cursor };
}

/** The note grid for one exercise type at one point in the rotation walk.
 * Extracted so a drill can request a type directly; the arithmetic is pinned by
 * the parity fixture, so it must stay identical for both callers. */
function buildSpec(
  calibration: Calibration,
  sessionIndex: number,
  exerciseType: ExerciseType,
  suffix: string,
): ExerciseSpec {
  const shape = SHAPES[exerciseType];
  const span = Math.max(...shape);

  const tessituraLow = calibration.tessitura_low_midi;
  const tessituraHigh = calibration.tessitura_high_midi;
  const rangeHigh = calibration.range_high_midi;

  if (tessituraLow === null || tessituraHigh === null) {
    throw new Error("calibration lacks a tessitura");
  }

  const maxStarting = Math.min(tessituraHigh, rangeHigh - span);
  const minStarting = Math.min(tessituraLow, maxStarting);
  const startingOptions = Math.max(1, maxStarting - minStarting + 1);
  const walkPosition = Math.floor(sessionIndex / TYPE_ROTATION.length) % startingOptions;
  const startingNote = minStarting + walkPosition;

  return {
    type: exerciseType,
    target_notes_midi: shape.map((offset) => startingNote + offset),
    duration_per_note_s: DURATIONS[exerciseType],
    vowel: "ah",
    display_name:
      `${exerciseType} on 'ah', starting ${midiToName(startingNote)}` + suffix,
  };
}

export function nextExercise(
  calibration: Calibration,
  sessionIndex: number,
  focusArea: FocusArea | null = null,
): ExerciseSpec {
  const targeted = focusArea !== null && focusArea in FOCUS_TO_TYPE;
  const exerciseType: ExerciseType = targeted
    ? FOCUS_TO_TYPE[focusArea]
    : TYPE_ROTATION[sessionIndex % TYPE_ROTATION.length];
  const suffix = targeted ? ` (focus: ${FOCUS_LABELS[focusArea]})` : "";
  return buildSpec(calibration, sessionIndex, exerciseType, suffix);
}

/** The exercise a coaching drill asked for by name, so "practice this drill"
 * lands on the right shape rather than on whatever the rotation was up to. */
export function exerciseForDrill(
  calibration: Calibration,
  sessionIndex: number,
  exerciseType: string,
  drillName: string,
): ExerciseSpec {
  if (!(TYPE_ROTATION as readonly string[]).includes(exerciseType)) {
    throw new Error(`unknown exercise type '${exerciseType}'`);
  }
  return buildSpec(
    calibration,
    sessionIndex,
    exerciseType as ExerciseType,
    ` (drill: ${drillName})`,
  );
}
