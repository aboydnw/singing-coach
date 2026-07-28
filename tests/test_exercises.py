import pytest

from singing_coach import exercises
from singing_coach.models import Calibration

CALIBRATION = Calibration(
    range_low_midi=48,
    range_high_midi=72,
    tessitura_low_midi=55,
    tessitura_high_midi=67,
)


def test_next_exercise_is_deterministic():
    a = exercises.next_exercise(CALIBRATION, session_index=0)
    b = exercises.next_exercise(CALIBRATION, session_index=0)
    assert a == b


def test_rotation_cycles_through_four_types():
    types_in_order = [
        exercises.next_exercise(CALIBRATION, session_index=i).type
        for i in range(4)
    ]
    assert set(types_in_order) == {"sustained", "scale", "arpeggio", "siren"}
    assert len(set(types_in_order)) == 4


def test_rotation_repeats_after_four_sessions():
    first_cycle = [exercises.next_exercise(CALIBRATION, session_index=i).type for i in range(4)]
    second_cycle = [exercises.next_exercise(CALIBRATION, session_index=i + 4).type for i in range(4)]
    assert first_cycle == second_cycle


def test_all_target_notes_within_calibration_range():
    for i in range(16):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        for note in spec.target_notes_midi:
            assert CALIBRATION.range_low_midi <= note <= CALIBRATION.range_high_midi, (
                f"session {i} ({spec.type}): note {note} outside range"
            )


def test_starting_note_within_tessitura():
    for i in range(8):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        starting = spec.target_notes_midi[0]
        assert CALIBRATION.tessitura_low_midi <= starting <= CALIBRATION.tessitura_high_midi, (
            f"session {i} ({spec.type}): starting note {starting} outside tessitura"
        )


def test_sustained_is_single_note():
    for i in range(16):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        if spec.type == "sustained":
            assert len(spec.target_notes_midi) == 1


def test_scale_is_five_ascending_notes():
    for i in range(16):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        if spec.type == "scale":
            notes = spec.target_notes_midi
            assert len(notes) == 5
            assert notes == sorted(notes)


def test_arpeggio_is_major_triad_plus_octave():
    for i in range(16):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        if spec.type == "arpeggio":
            notes = spec.target_notes_midi
            root = notes[0]
            assert notes == [root, root + 4, root + 7, root + 12]


def test_siren_ascends_then_descends():
    for i in range(16):
        spec = exercises.next_exercise(CALIBRATION, session_index=i)
        if spec.type == "siren":
            notes = spec.target_notes_midi
            mid = len(notes) // 2
            assert notes[:mid] == sorted(notes[:mid])
            assert notes[mid:] == sorted(notes[mid:], reverse=True)


def test_display_name_includes_type_and_starting_note_name():
    spec = exercises.next_exercise(CALIBRATION, session_index=0)
    assert spec.type in spec.display_name.lower()
    starting_name = exercises.midi_to_name(spec.target_notes_midi[0])
    assert starting_name in spec.display_name


def test_midi_to_name_known_values():
    assert exercises.midi_to_name(60) == "C4"
    assert exercises.midi_to_name(69) == "A4"
    assert exercises.midi_to_name(62) == "D4"


def test_walks_starting_note_across_tessitura():
    starts = {
        exercises.next_exercise(CALIBRATION, session_index=i).target_notes_midi[0]
        for i in range(16)
    }
    assert len(starts) > 1


@pytest.mark.parametrize(
    ("focus_area", "expected_type"),
    [
        ("breath_support", "sustained"),
        ("tone_quality", "sustained"),
        ("vibrato", "sustained"),
        ("pitch_accuracy", "scale"),
        ("agility", "arpeggio"),
        ("range", "siren"),
    ],
)
def test_focus_area_picks_matching_exercise_type(focus_area, expected_type):
    spec = exercises.next_exercise(CALIBRATION, session_index=0, focus_area=focus_area)
    assert spec.type == expected_type


def test_focus_area_is_named_in_display_name():
    spec = exercises.next_exercise(CALIBRATION, session_index=0, focus_area="pitch_accuracy")
    assert "pitch accuracy" in spec.display_name


def test_unknown_focus_area_falls_back_to_rotation():
    with_unknown = exercises.next_exercise(CALIBRATION, session_index=1, focus_area="nonsense")
    without = exercises.next_exercise(CALIBRATION, session_index=1)
    assert with_unknown == without
