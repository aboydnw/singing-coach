"""Voice quality and vibrato analysis via Parselmouth + numpy FFT."""

from pathlib import Path

import numpy as np
import parselmouth
from parselmouth.praat import call

from singing_coach import pitch

VIBRATO_BAND_HZ = (3.0, 8.0)


def analyze(audio_path: Path) -> dict[str, float]:
    sound = parselmouth.Sound(str(audio_path))

    pitch_obj = sound.to_pitch()
    point_process = call(
        [sound, pitch_obj], "To PointProcess (cc)"
    )
    jitter_local = call(
        point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3
    )
    shimmer_local = call(
        [sound, point_process],
        "Get shimmer (local)",
        0, 0, 0.0001, 0.02, 1.3, 1.6,
    )
    harmonicity = sound.to_harmonicity()
    hnr_mean = float(call(harmonicity, "Get mean", 0, 0))

    formant = sound.to_formant_burg()
    f1_mean = float(call(formant, "Get mean", 1, 0, 0, "Hertz"))
    f2_mean = float(call(formant, "Get mean", 2, 0, 0, "Hertz"))

    vibrato_rate, vibrato_extent = _vibrato_from_contour(sound)

    return {
        "jitter_local": float(jitter_local),
        "shimmer_local": float(shimmer_local),
        "hnr_mean": hnr_mean,
        "vibrato_rate_hz": vibrato_rate,
        "vibrato_extent_cents": vibrato_extent,
        "f1_mean": f1_mean,
        "f2_mean": f2_mean,
    }


def _vibrato_from_contour(sound: parselmouth.Sound) -> tuple[float, float]:
    samples = sound.values[0].astype(np.float32)
    sr = int(sound.sampling_frequency)
    times, f0, confidence = pitch.predict(samples, sr)
    stable_mask = (confidence > 0.5) & (f0 > 0)
    if stable_mask.sum() < 16:
        return 0.0, 0.0

    f0_stable = f0[stable_mask]
    times_stable = times[stable_mask]
    median_hz = float(np.median(f0_stable))
    cents_series = 1200.0 * np.log2(f0_stable / median_hz)
    cents_series = cents_series - cents_series.mean()

    frame_rate = 1.0 / np.median(np.diff(times_stable))
    spectrum = np.abs(np.fft.rfft(cents_series))
    freqs = np.fft.rfftfreq(cents_series.size, d=1.0 / frame_rate)

    band = (freqs >= VIBRATO_BAND_HZ[0]) & (freqs <= VIBRATO_BAND_HZ[1])
    if not band.any():
        return 0.0, 0.0
    band_spectrum = spectrum.copy()
    band_spectrum[~band] = 0.0
    peak_idx = int(np.argmax(band_spectrum))
    vibrato_rate = float(freqs[peak_idx])
    vibrato_extent = float(np.std(cents_series) * np.sqrt(2.0))

    return vibrato_rate, vibrato_extent
