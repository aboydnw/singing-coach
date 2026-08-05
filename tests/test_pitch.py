import numpy as np
import pytest

from singing_coach import pitch

from tests import tones


def test_hz_to_midi_a4_is_69():
    assert pitch.hz_to_midi(440.0) == pytest.approx(69.0, abs=0.01)


def test_midi_to_hz_a4_is_440():
    assert pitch.midi_to_hz(69) == pytest.approx(440.0, abs=0.01)


def test_cents_off_target_zero_at_target():
    assert pitch.cents_off_target(detected_hz=440.0, target_hz=440.0) == pytest.approx(0.0)


def test_cents_off_target_positive_when_sharp():
    sharp_50_cents = 440.0 * 2 ** (50 / 1200)
    assert pitch.cents_off_target(sharp_50_cents, 440.0) == pytest.approx(50.0, abs=0.5)


def test_predict_detects_a4_sine():
    audio, sr = tones.sine(midi_note=69, duration_s=1.0)  # A4
    times, f0, confidence = pitch.predict(audio, sr)

    assert times.shape == f0.shape == confidence.shape
    high_conf = f0[confidence > 0.5]
    assert high_conf.size > 0
    median = float(np.median(high_conf))
    cents_off = abs(pitch.cents_off_target(median, 440.0))
    assert cents_off < 10.0


def test_predict_stable_pitch_filter_drops_low_confidence():
    audio, sr = tones.sine(midi_note=60, duration_s=0.5)
    times, f0, confidence = pitch.predict(audio, sr)
    stable = pitch.stable_pitches(f0, confidence, min_confidence=0.5)
    assert stable.size > 0
    assert np.all(stable > 0)
