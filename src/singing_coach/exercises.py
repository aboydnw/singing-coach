"""Deterministic exercise generation. Pure functions; state passed in by caller."""

from singing_coach.models import Calibration, ExerciseSpec

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

TYPE_ROTATION = ["sustained", "scale", "arpeggio", "siren"]

# Semitone offsets from the starting (root) note for each exercise type.
SHAPES = {
    "sustained": [0],
    "scale": [0, 2, 4, 5, 7],
    "arpeggio": [0, 4, 7, 12],
    "siren": [0, 5, 12, 5, 0],
}

DURATIONS = {
    "sustained": 3.0,
    "scale": 0.5,
    "arpeggio": 0.5,
    "siren": 0.5,
}

# Which exercise type best trains each coaching focus area.
FOCUS_TO_TYPE = {
    "breath_support": "sustained",
    "tone_quality": "sustained",
    "vibrato": "sustained",
    "pitch_accuracy": "scale",
    "agility": "arpeggio",
    "range": "siren",
}

FOCUS_LABELS = {
    "breath_support": "breath support",
    "tone_quality": "tone quality",
    "vibrato": "vibrato",
    "pitch_accuracy": "pitch accuracy",
    "agility": "agility",
    "range": "range",
}


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def next_exercise(
    calibration: Calibration,
    session_index: int,
    focus_area: str | None = None,
) -> ExerciseSpec:
    """Generate the next exercise for the user's range.

    When the last coaching session named a focus area, the exercise type that
    best trains it is chosen; otherwise the type rotates deterministically.
    """
    if focus_area in FOCUS_TO_TYPE:
        exercise_type = FOCUS_TO_TYPE[focus_area]
    else:
        exercise_type = TYPE_ROTATION[session_index % len(TYPE_ROTATION)]
    shape = SHAPES[exercise_type]
    span = max(shape)

    tessitura_low = calibration.tessitura_low_midi
    tessitura_high = calibration.tessitura_high_midi
    range_high = calibration.range_high_midi

    max_starting = min(tessitura_high, range_high - span)
    min_starting = min(tessitura_low, max_starting)
    starting_options = max(1, max_starting - min_starting + 1)
    walk_position = (session_index // len(TYPE_ROTATION)) % starting_options
    starting_note = min_starting + walk_position

    target_notes = [starting_note + offset for offset in shape]
    starting_name = midi_to_name(starting_note)
    display_name = f"{exercise_type} on 'ah', starting {starting_name}"
    if focus_area in FOCUS_TO_TYPE:
        display_name += f" (focus: {FOCUS_LABELS[focus_area]})"

    return ExerciseSpec(
        type=exercise_type,
        target_notes_midi=target_notes,
        duration_per_note_s=DURATIONS[exercise_type],
        vowel="ah",
        display_name=display_name,
    )
