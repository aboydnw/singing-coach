"""Regenerate the regression fixture: a deterministic 10s sung A3 plus its
expected measurements, produced with torch.set_num_threads(1) to match the
deployed function's configuration.

    uv run python tests/fixtures/generate.py
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

torch.set_num_threads(1)

from singing_coach import accuracy, audio_io, pitch, voice_qa
from singing_coach.models import ExerciseSpec

SAMPLE_RATE = 48000
DURATION_S = 10.0
BASE_HZ = 220.0
VIBRATO_RATE_HZ = 5.5
VIBRATO_DEPTH_CENTS = 50.0
SEED = 20260804

SPEC = ExerciseSpec(
    type="sustained",
    target_notes_midi=[57],
    duration_per_note_s=10.0,
    vowel="ah",
    display_name="sustained A3 fixture",
)


def synthesize() -> np.ndarray:
    rng = np.random.default_rng(SEED)
    n = int(SAMPLE_RATE * DURATION_S)
    t = np.arange(n) / SAMPLE_RATE

    cents = VIBRATO_DEPTH_CENTS * np.sin(2 * np.pi * VIBRATO_RATE_HZ * t)
    f0 = BASE_HZ * 2.0 ** (cents / 1200.0)
    phase = 2 * np.pi * np.cumsum(f0) / SAMPLE_RATE

    harmonics = {1: 1.0, 2: 0.6, 3: 0.7, 4: 0.3, 5: 0.35, 6: 0.15, 7: 0.08, 8: 0.05}
    signal = np.zeros(n)
    for harmonic, amp in harmonics.items():
        signal += amp * np.sin(harmonic * phase)

    tremolo = 1.0 + 0.04 * np.sin(2 * np.pi * VIBRATO_RATE_HZ * t + 0.7)
    signal *= tremolo
    signal += 0.002 * rng.standard_normal(n)

    fade = int(0.05 * SAMPLE_RATE)
    envelope = np.ones(n)
    envelope[:fade] = np.linspace(0.0, 1.0, fade)
    envelope[-fade:] = np.linspace(1.0, 0.0, fade)
    signal *= envelope

    signal /= np.max(np.abs(signal)) * 1.25
    return (signal * 32767.0).astype(np.int16)


def main() -> None:
    fixtures = Path(__file__).parent
    wav_path = fixtures / "sustained_a3.wav"
    sf.write(wav_path, synthesize(), SAMPLE_RATE, subtype="PCM_16")

    audio, sr = audio_io.load(wav_path)
    times, f0, confidence = pitch.predict(audio, sr)
    measurements = voice_qa.analyze(wav_path, contour=(times, f0, confidence))
    measurements.accuracy = accuracy.score(SPEC, times, f0, confidence)

    stable = pitch.stable_pitches(f0, confidence)
    expected = {
        "spec": json.loads(SPEC.model_dump_json()),
        "measurements": json.loads(measurements.model_dump_json()),
        "pitch_median_midi": float(np.median([pitch.hz_to_midi(h) for h in stable])),
    }
    (fixtures / "sustained_a3_expected.json").write_text(
        json.dumps(expected, indent=2) + "\n"
    )
    print(json.dumps(expected["measurements"], indent=2))


if __name__ == "__main__":
    main()
