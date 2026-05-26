"""Deterministic exercise generation. Pure functions; state passed in by caller."""

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


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def next_exercise(calibration: dict, session_index: int) -> dict:
    exercise_type = TYPE_ROTATION[session_index % len(TYPE_ROTATION)]
    shape = SHAPES[exercise_type]
    span = max(shape)

    tessitura_low = calibration["tessitura_low_midi"]
    tessitura_high = calibration["tessitura_high_midi"]
    range_high = calibration["range_high_midi"]

    max_starting = min(tessitura_high, range_high - span)
    starting_options = max(1, max_starting - tessitura_low + 1)
    walk_position = (session_index // len(TYPE_ROTATION)) % starting_options
    starting_note = tessitura_low + walk_position

    target_notes = [starting_note + offset for offset in shape]
    starting_name = midi_to_name(starting_note)
    display_name = f"{exercise_type} on 'ah', starting {starting_name}"

    return {
        "type": exercise_type,
        "target_notes_midi": target_notes,
        "duration_per_note_s": DURATIONS[exercise_type],
        "vowel": "ah",
        "display_name": display_name,
    }
