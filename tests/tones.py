"""Reference tone synthesis for exercise playback and test fixtures."""

from pathlib import Path

import numpy as np
import soundfile as sf

SAMPLE_RATE = 16000


def midi_to_hz(midi_note: int) -> float:
    return 440.0 * 2 ** ((midi_note - 69) / 12)


def sine(midi_note: int, duration_s: float) -> tuple[np.ndarray, int]:
    freq = midi_to_hz(midi_note)
    n_samples = int(duration_s * SAMPLE_RATE)
    t = np.arange(n_samples, dtype=np.float32) / SAMPLE_RATE
    audio = (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return audio, SAMPLE_RATE


def save_sine(midi_note: int, duration_s: float, path: Path) -> None:
    audio, sr = sine(midi_note=midi_note, duration_s=duration_s)
    sf.write(path, audio, sr)


def sequence(
    midi_notes: list[int], duration_per_note_s: float
) -> tuple[np.ndarray, int]:
    clips = [sine(n, duration_per_note_s)[0] for n in midi_notes]
    audio = np.concatenate(clips).astype(np.float32)
    return audio, SAMPLE_RATE
