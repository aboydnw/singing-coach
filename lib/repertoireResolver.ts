import { passagesForFocus, type SongPassage } from "@/lib/repertoireCatalogue";
import {
  exerciseSpecSchema,
  type Calibration,
  type ExerciseSpec,
  type FocusArea,
} from "@/lib/schema";

const BASE_MIDI = 60;

export type ResolvedPassage = { semitones: number; spec: ExerciseSpec };
export type SelectedSongPassage = ResolvedPassage & {
  options: ResolvedPassage[];
  selectedIndex: number;
};

export function resolvePassage(
  passage: SongPassage,
  calibration: Calibration,
  semitones: number,
): ExerciseSpec | null {
  const noteOffsets = passage.events.flatMap((event) =>
    event.kind === "note" ? [event.midi_offset] : [],
  );
  const tessituraCenter =
    ((calibration.tessitura_low_midi ?? calibration.range_low_midi) +
      (calibration.tessitura_high_midi ?? calibration.range_high_midi)) /
    2;
  const roots = Array.from(
    { length: 7 },
    (_, index) => BASE_MIDI + semitones + (index - 3) * 12,
  )
    .filter(
      (root) =>
        root + Math.min(...noteOffsets) >= calibration.range_low_midi &&
        root + Math.max(...noteOffsets) <= calibration.range_high_midi,
    )
    .sort(
      (a, b) =>
        Math.abs(a + average(noteOffsets) - tessituraCenter) -
        Math.abs(b + average(noteOffsets) - tessituraCenter),
    );
  if (!roots.length) return null;
  const root = roots[0];
  const events = passage.events.map((event) =>
    event.kind === "rest"
      ? event
      : {
          kind: "note" as const,
          midi: root + event.midi_offset,
          duration_s: event.duration_s,
          syllable: event.syllable,
        },
  );
  const notes = events.flatMap((event) => (event.kind === "note" ? [event.midi] : []));
  const firstDuration = events.find((event) => event.kind === "note")?.duration_s ?? 0.5;
  return {
    type: "scale",
    target_notes_midi: notes,
    duration_per_note_s: firstDuration,
    vowel: "lyrics",
    display_name: passage.title,
    activity_kind: "song_passage",
    activity_id: passage.id,
    activity_version: passage.version,
    events,
    instructions: passage.instructions,
    primary_cue: passage.primary_cue,
    variety: {
      shape: "song-phrase",
      rhythm: "lyric",
      direction: "mixed",
      articulation: "legato",
      dynamics: "expressive",
    },
    reference_audio: [],
    excerpt: passage.excerpt,
    focus_areas: passage.focus_areas,
    transposition_semitones: semitones,
    source: passage.source,
  };
}

export function safePassageTranspositions(
  passage: SongPassage,
  calibration: Calibration,
): ResolvedPassage[] {
  return passage.render_transpositions.flatMap((semitones) => {
    const spec = resolvePassage(passage, calibration, semitones);
    return spec ? [{ semitones, spec }] : [];
  });
}

export function selectSongPassage(args: {
  calibration: Calibration;
  focusArea: FocusArea | null;
  history: { exercise_spec_json: string | null }[];
}): SelectedSongPassage | null {
  const recentIds = args.history.flatMap((row) => {
    if (!row.exercise_spec_json) return [];
    try {
      const parsed = exerciseSpecSchema.safeParse(JSON.parse(row.exercise_spec_json));
      return parsed.success && parsed.data.activity_kind === "song_passage"
        ? [parsed.data.activity_id]
        : [];
    } catch {
      return [];
    }
  });
  const center =
    ((args.calibration.tessitura_low_midi ?? args.calibration.range_low_midi) +
      (args.calibration.tessitura_high_midi ?? args.calibration.range_high_midi)) /
    2;
  const candidates = passagesForFocus(args.focusArea).flatMap(
    (passage, catalogueIndex) => {
      const options = safePassageTranspositions(passage, args.calibration);
      if (!options.length) return [];
      const selectedIndex = options
        .map((option, index) => ({
          index,
          distance: Math.abs(average(option.spec.target_notes_midi) - center),
        }))
        .sort((a, b) => a.distance - b.distance)[0].index;
      const uses = recentIds.filter((id) => id === passage.id).length;
      return [
        {
          ...options[selectedIndex],
          options,
          selectedIndex,
          score: uses * 100 + catalogueIndex,
        },
      ];
    },
  );
  const selected = candidates.sort((a, b) => a.score - b.score)[0];
  if (!selected) return null;
  const { score: _score, ...result } = selected;
  return result;
}

export function shiftSongKey(
  selected: SelectedSongPassage,
  direction: "lower" | "higher",
): SelectedSongPassage | null {
  const selectedIndex = selected.selectedIndex + (direction === "higher" ? 1 : -1);
  const next = selected.options[selectedIndex];
  return next ? { ...next, options: selected.options, selectedIndex } : null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
