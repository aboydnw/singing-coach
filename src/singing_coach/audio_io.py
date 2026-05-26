"""Load recorded audio and normalize to 16 kHz mono float32."""

from pathlib import Path

import librosa
import numpy as np

TARGET_SAMPLE_RATE = 16000


def load(path: Path) -> tuple[np.ndarray, int]:
    audio, sr = librosa.load(path, sr=TARGET_SAMPLE_RATE, mono=True)
    return audio.astype(np.float32), int(sr)
