import numpy as np
import pytest

from singing_coach import accuracy, pitch
from singing_coach.models import ExerciseSpec


def _spec(notes: list[int], duration: float = 0.5) -> ExerciseSpec:
    return ExerciseSpec(
        type="scale" if len(notes) > 1 else "sustained",
        target_notes_midi=notes,
        duration_per_note_s=duration,
        vowel="ah",
        display_name="test exercise",
    )


def _contour(midi_notes: list[float], frames_per_note: int = 50, hop_s: float = 0.01):
    f0 = np.concatenate(
        [np.full(frames_per_note, pitch.midi_to_hz(m)) for m in midi_notes]
    )
    times = np.arange(f0.size) * hop_s
    confidence = np.ones_like(f0)
    return times, f0, confidence


def test_perfect_singing_scores_near_zero_cents():
    notes = [60, 62, 64]
    times, f0, conf = _contour(notes)

    result = accuracy.score(_spec(notes), times, f0, conf)

    assert result is not None
    assert result.mean_abs_cents_off == pytest.approx(0.0, abs=5.0)
    for note_result in result.per_note:
        assert note_result.cents_off == pytest.approx(0.0, abs=5.0)


def test_flat_singing_reports_negative_cents():
    target = [60]
    sung = [59.5]  # 50 cents flat
    times, f0, conf = _contour(sung)

    result = accuracy.score(_spec(target), times, f0, conf)

    assert result.per_note[0].cents_off == pytest.approx(-50.0, abs=5.0)
    assert result.mean_abs_cents_off == pytest.approx(50.0, abs=5.0)


def test_sharp_singing_reports_positive_cents():
    times, f0, conf = _contour([60.3])
    result = accuracy.score(_spec([60]), times, f0, conf)
    assert result.per_note[0].cents_off == pytest.approx(30.0, abs=5.0)


def test_note_names_match_targets():
    notes = [60, 64]
    times, f0, conf = _contour([60.0, 64.0])
    result = accuracy.score(_spec(notes), times, f0, conf)
    assert [n.target_name for n in result.per_note] == ["C4", "E4"]


def test_returns_none_when_nothing_voiced():
    notes = [60, 62]
    times, f0, conf = _contour([60.0, 62.0])
    conf[:] = 0.0

    assert accuracy.score(_spec(notes), times, f0, conf) is None


def test_leading_and_trailing_silence_is_trimmed():
    notes = [60]
    times, f0, conf = _contour([60.0], frames_per_note=100)
    conf[:30] = 0.0
    conf[-30:] = 0.0

    result = accuracy.score(_spec(notes), times, f0, conf)

    assert result.per_note[0].cents_off == pytest.approx(0.0, abs=5.0)


def test_unvoiced_segment_yields_none_for_that_note():
    notes = [60, 62]
    times, f0, conf = _contour([60.0, 62.0], frames_per_note=50)
    conf[50:] = 0.0
    # Re-voice one tail frame so the voiced span still spans both segments, but the
    # second segment stays below the frames-per-note floor.
    conf[-1] = 1.0

    result = accuracy.score(_spec(notes), times, f0, conf)

    assert result is not None
    assert result.per_note[0].cents_off is not None
    assert result.per_note[1].cents_off is None
    assert result.mean_abs_cents_off == pytest.approx(0.0, abs=5.0)
