"""The committed fixture must always produce the committed numbers.

This is the defence against any change — dependency bump, refactor, new
runtime — silently shifting every measurement the app produces. Praat metrics
get a tight relative tolerance; CREPE-derived ones a slightly looser one.
"""

import json
from pathlib import Path

import pytest
import torch

torch.set_num_threads(1)

from singing_coach import accuracy, audio_io, pitch, voice_qa
from singing_coach.models import ExerciseSpec

FIXTURES = Path(__file__).parent / "fixtures"

PRAAT_REL_TOL = 1e-6
CREPE_REL_TOL = 1e-4
CENTS_ABS_TOL = 0.2


@pytest.fixture(scope="module")
def expected():
    return json.loads((FIXTURES / "sustained_a3_expected.json").read_text())


@pytest.fixture(scope="module")
def actual(expected):
    wav_path = FIXTURES / "sustained_a3.wav"
    spec = ExerciseSpec(**expected["spec"])
    audio, sr = audio_io.load(wav_path)
    times, f0, confidence = pitch.predict(audio, sr)
    measurements = voice_qa.analyze(wav_path, contour=(times, f0, confidence))
    measurements.accuracy = accuracy.score(spec, times, f0, confidence)
    stable = pitch.stable_pitches(f0, confidence)
    import numpy as np

    return {
        "measurements": json.loads(measurements.model_dump_json()),
        "pitch_median_midi": float(
            np.median([pitch.hz_to_midi(h) for h in stable])
        ),
    }


@pytest.mark.parametrize(
    "field", ["jitter_local", "shimmer_local", "hnr_mean", "f1_mean", "f2_mean"]
)
def test_praat_metrics_match(actual, expected, field):
    assert actual["measurements"][field] == pytest.approx(
        expected["measurements"][field], rel=PRAAT_REL_TOL
    )


@pytest.mark.parametrize("field", ["vibrato_rate_hz", "vibrato_extent_cents"])
def test_crepe_derived_metrics_match(actual, expected, field):
    assert actual["measurements"][field] == pytest.approx(
        expected["measurements"][field], rel=CREPE_REL_TOL
    )


def test_pitch_median_matches(actual, expected):
    assert actual["pitch_median_midi"] == pytest.approx(
        expected["pitch_median_midi"], rel=CREPE_REL_TOL
    )


def test_accuracy_matches(actual, expected):
    actual_acc = actual["measurements"]["accuracy"]
    expected_acc = expected["measurements"]["accuracy"]
    assert len(actual_acc["per_note"]) == len(expected_acc["per_note"])
    for got, want in zip(actual_acc["per_note"], expected_acc["per_note"]):
        assert got["target_midi"] == want["target_midi"]
        assert got["target_name"] == want["target_name"]
        assert got["cents_off"] == pytest.approx(
            want["cents_off"], abs=CENTS_ABS_TOL
        )
