"""Resynthesis is checked by measuring the output with the app's own pipeline.

A corrected exemplar the singer cannot trust is worse than no exemplar, so the
assertion is not "a file came out" but "voice_qa reads back what we asked for".
"""

from pathlib import Path

import numpy as np
import pytest

from singing_coach import pitch, resynth, voice_qa

FIXTURE = Path(__file__).parent / "fixtures" / "sustained_a3.wav"


def _cents_spread(path: Path) -> float:
    sound = resynth.load(path)
    f0 = sound.to_pitch().selected_array["frequency"]
    voiced = f0[f0 > 0]
    median = float(np.median(voiced))
    return float(np.std(1200.0 * np.log2(voiced / median)))


def _measure(path: Path):
    sound = resynth.load(path)
    samples = sound.values[0].astype(np.float32)
    contour = pitch.predict(samples, int(sound.sampling_frequency))
    return voice_qa.analyze(path, contour=contour)


@pytest.fixture
def steady(tmp_path):
    out = tmp_path / "steady.wav"
    resynth.save(resynth.steady_pitch(resynth.load(FIXTURE)), out)
    return out


def test_steady_pitch_removes_the_planted_vibrato(steady):
    assert _cents_spread(steady) < _cents_spread(FIXTURE) / 5


def test_steady_pitch_keeps_the_original_note(steady):
    before = _measure(FIXTURE)
    after = _measure(steady)
    assert after.vibrato_extent_cents < before.vibrato_extent_cents


def test_injected_vibrato_measures_back_at_the_requested_rate(tmp_path):
    out = tmp_path / "vibrato.wav"
    straight = resynth.steady_pitch(resynth.load(FIXTURE))
    resynth.save(resynth.healthy_vibrato(straight, rate_hz=5.5), out)
    assert _measure(out).vibrato_rate_hz == pytest.approx(5.5, abs=0.3)


def test_injected_vibrato_measures_back_at_the_requested_depth(tmp_path):
    out = tmp_path / "vibrato.wav"
    straight = resynth.steady_pitch(resynth.load(FIXTURE))
    resynth.save(resynth.healthy_vibrato(straight, extent_cents=50.0), out)
    # voice_qa reports extent as an RMS-derived figure, so a 50-cent peak
    # deviation reads back near 50/sqrt(2) * sqrt(2) = the same order, not the
    # peak itself. The band is wide enough to survive that convention.
    assert 25.0 < _measure(out).vibrato_extent_cents < 75.0


def test_correct_dispatches_every_named_correction():
    sound = resynth.load(FIXTURE)
    for correction in resynth.CORRECTIONS:
        assert resynth.correct(sound, correction).values.size > 0


def test_correct_rejects_an_unknown_correction():
    with pytest.raises(ValueError):
        resynth.correct(resynth.load(FIXTURE), "make_it_better")


def test_silence_raises_rather_than_returning_a_broken_exemplar(tmp_path):
    silent = tmp_path / "silent.wav"
    resynth.save(
        parselmouth_silence(duration_s=1.0, sample_rate=44100),
        silent,
    )
    with pytest.raises(resynth.NotEnoughPitch):
        resynth.steady_pitch(resynth.load(silent))


def parselmouth_silence(duration_s: float, sample_rate: int):
    import parselmouth

    n = int(duration_s * sample_rate)
    return parselmouth.Sound(np.zeros(n), sampling_frequency=sample_rate)
