from pathlib import Path

import numpy as np
import soundfile as sf

from singing_coach import audio_io


def test_load_resamples_to_16khz_mono(tmp_audio_dir: Path):
    sr_in = 48000
    t = np.arange(sr_in, dtype=np.float32) / sr_in
    stereo = np.stack([np.sin(2 * np.pi * 440 * t), np.sin(2 * np.pi * 440 * t)], axis=1)
    src = tmp_audio_dir / "stereo_48k.wav"
    sf.write(src, stereo, sr_in)

    audio, sr = audio_io.load(src)

    assert sr == 16000
    assert audio.ndim == 1
    assert audio.shape == (16000,)
    assert audio.dtype == np.float32


def test_load_passes_through_16khz_mono(tmp_audio_dir: Path):
    sr_in = 16000
    audio_src = np.sin(2 * np.pi * 440 * np.arange(sr_in, dtype=np.float32) / sr_in)
    src = tmp_audio_dir / "mono_16k.wav"
    sf.write(src, audio_src, sr_in)

    audio, sr = audio_io.load(src)

    assert sr == 16000
    assert audio.shape == (16000,)
