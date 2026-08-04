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

export function nextExercise(
  calibration: Calibration,
  sessionIndex: number,
  focusArea: FocusArea | null = null,
): ExerciseSpec {
  const exerciseType: ExerciseType =
    focusArea !== null && focusArea in FOCUS_TO_TYPE
      ? FOCUS_TO_TYPE[focusArea]
      : TYPE_ROTATION[sessionIndex % TYPE_ROTATION.length];
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

  const targetNotes = shape.map((offset) => startingNote + offset);
  let displayName = `${exerciseType} on 'ah', starting ${midiToName(startingNote)}`;
  if (focusArea !== null && focusArea in FOCUS_TO_TYPE) {
    displayName += ` (focus: ${FOCUS_LABELS[focusArea]})`;
  }

  return {
    type: exerciseType,
    target_notes_midi: targetNotes,
    duration_per_note_s: DURATIONS[exerciseType],
    vowel: "ah",
    display_name: displayName,
  };
}
