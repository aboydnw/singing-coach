from pathlib import Path

import numpy as np
import soundfile as sf

from singing_coach import tone_gen


def test_sine_returns_correct_shape_and_sample_rate():
    audio, sr = tone_gen.sine(midi_note=69, duration_s=1.0)  # A4 = 440 Hz
    assert sr == 16000
    assert audio.shape == (16000,)
    assert audio.dtype == np.float32


def test_sine_has_correct_fundamental_frequency():
    audio, sr = tone_gen.sine(midi_note=69, duration_s=1.0)
    spectrum = np.abs(np.fft.rfft(audio))
    freqs = np.fft.rfftfreq(audio.size, d=1 / sr)
    peak_freq = freqs[np.argmax(spectrum)]
    assert abs(peak_freq - 440.0) < 1.0


def test_save_sine_writes_wav(tmp_audio_dir: Path):
    out = tmp_audio_dir / "a4.wav"
    tone_gen.save_sine(midi_note=69, duration_s=0.5, path=out)
    assert out.exists()
    audio, sr = sf.read(out)
    assert sr == 16000
    assert audio.shape == (8000,)


def test_sequence_concatenates_multiple_notes():
    audio, sr = tone_gen.sequence(
        midi_notes=[60, 62, 64],  # C4, D4, E4
        duration_per_note_s=0.25,
    )
    assert sr == 16000
    assert audio.shape == (12000,)
