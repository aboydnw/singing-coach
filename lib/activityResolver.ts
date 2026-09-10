import type { TechnicalActivity } from "@/lib/activityCatalogue";
import { findDrill, stateForDrill } from "@/lib/pedagogy";
import type { Calibration, ExerciseSpec } from "@/lib/schema";

export const ACTIVITY_TRANSPOSITIONS = [-6, -4, -2, 0, 2, 4, 6] as const;
const CATALOGUE_BASE_MIDI = 60;

export type ResolvedActivity = {
  semitones: number;
  spec: ExerciseSpec;
};

export function resolveActivity(
  activity: TechnicalActivity,
  calibration: Calibration,
  semitones: number,
): ExerciseSpec | null {
  if (activity.mode !== "scored") return null;
  const root = CATALOGUE_BASE_MIDI + semitones;
  const events = activity.events.map((event) =>
    event.kind === "rest" ? event : { ...event, midi: root + event.midi_offset },
  );
  const notes = events.flatMap((event) => (event.kind === "note" ? [event.midi] : []));
  if (
    notes.length === 0 ||
    Math.min(...notes) < calibration.range_low_midi ||
    Math.max(...notes) > calibration.range_high_midi
  ) {
    return null;
  }

  const drill = findDrill(activity.drill_id);
  const requestedType = drill?.exercise_type;
  const type = isExerciseType(requestedType) ? requestedType : inferType(activity);
  const firstNoteDuration =
    events.find((event) => event.kind === "note")?.duration_s ?? 0.5;

  return {
    type,
    target_notes_midi: notes,
    duration_per_note_s: firstNoteDuration,
    vowel: activity.vowel,
    display_name: drill?.name ?? activity.id,
    activity_kind: "technical",
    activity_id: activity.id,
    activity_version: activity.version,
    events: events.map((event) =>
      event.kind === "rest"
        ? event
        : {
            kind: "note" as const,
            midi: event.midi,
            duration_s: event.duration_s,
            syllable: event.syllable,
            ...(event.phoneme_hint ? { phoneme_hint: event.phoneme_hint } : {}),
            ...(event.articulation ? { articulation: event.articulation } : {}),
            ...(event.dynamic !== undefined ? { dynamic: event.dynamic } : {}),
          },
    ),
    instructions: activity.instructions,
    primary_cue: stateForDrill(activity.drill_id)?.cues[0] ?? activity.instructions,
    variety: activity.variety,
    transposition_semitones: semitones,
    reference_audio: activity.reference_audio ?? [],
  };
}

export function safeActivityTranspositions(
  activity: TechnicalActivity,
  calibration: Calibration,
): ResolvedActivity[] {
  return ACTIVITY_TRANSPOSITIONS.flatMap((semitones) => {
    const spec = resolveActivity(activity, calibration, semitones);
    return spec ? [{ semitones, spec }] : [];
  });
}

function isExerciseType(value: string | null | undefined): value is ExerciseSpec["type"] {
  return ["sustained", "scale", "arpeggio", "siren"].includes(value ?? "");
}

function inferType(activity: TechnicalActivity): ExerciseSpec["type"] {
  if (activity.variety.shape.includes("arpeggio")) return "arpeggio";
  if (
    activity.variety.shape.includes("siren") ||
    activity.variety.shape.includes("slide") ||
    activity.variety.shape.includes("glide")
  ) {
    return "siren";
  }
  const distinctOffsets = new Set(
    activity.events.flatMap((event) =>
      event.kind === "note" ? [event.midi_offset] : [],
    ),
  );
  return distinctOffsets.size > 1 ? "scale" : "sustained";
}
