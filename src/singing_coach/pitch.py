"""Pitch detection via torchcrepe; helpers for Hz <-> MIDI conversion."""

import numpy as np
import torch
import torchcrepe

FRAME_HOP_SAMPLES = 160
MIN_F0_HZ = 50.0
MAX_F0_HZ = 1100.0

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def hz_to_midi(hz: float) -> float:
    return 69.0 + 12.0 * np.log2(hz / 440.0)


def midi_to_hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def cents_off_target(detected_hz: float, target_hz: float) -> float:
    return 1200.0 * np.log2(detected_hz / target_hz)


def predict(
    audio: np.ndarray, sample_rate: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    # torchcrepe's viterbi decoder dithers each frame with unseeded random noise
    # (torchcrepe.convert.dither, +/-20 cents, via numpy's global RNG). Seeding
    # here makes the draw fixed so identical audio yields identical contours;
    # without it the same recording analyzes differently every run.
    np.random.seed(0)
    tensor = torch.from_numpy(audio).unsqueeze(0)
    f0, periodicity = torchcrepe.predict(
        tensor,
        sample_rate,
        FRAME_HOP_SAMPLES,
        MIN_F0_HZ,
        MAX_F0_HZ,
        model="tiny",
        return_periodicity=True,
        batch_size=512,
    )
    f0 = f0.squeeze(0).cpu().numpy()
    confidence = periodicity.squeeze(0).cpu().numpy()
    times = np.arange(f0.size) * FRAME_HOP_SAMPLES / sample_rate
    return times, f0, confidence


def stable_pitches(
    f0: np.ndarray, confidence: np.ndarray, min_confidence: float = 0.5
) -> np.ndarray:
    return f0[(confidence >= min_confidence) & (f0 > 0)]
