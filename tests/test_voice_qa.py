import numpy as np
import pytest
import soundfile as sf

from singing_coach import tone_gen, voice_qa


def _write_vibrato_sine(path, midi_note: int, duration_s: float, vibrato_rate_hz: float, vibrato_cents: float):
    sr = 16000
    base_hz = tone_gen.midi_to_hz(midi_note)
    n = int(duration_s * sr)
    t = np.arange(n, dtype=np.float32) / sr
    cents_offset = vibrato_cents * np.sin(2 * np.pi * vibrato_rate_hz * t)
    inst_freq = base_hz * 2 ** (cents_offset / 1200)
    phase = 2 * np.pi * np.cumsum(inst_freq) / sr
    audio = (0.5 * np.sin(phase)).astype(np.float32)
    sf.write(path, audio, sr)


def test_analyze_returns_expected_keys(tmp_audio_dir):
    path = tmp_audio_dir / "sustained.wav"
    tone_gen.save_sine(midi_note=60, duration_s=2.0, path=path)

    result = voice_qa.analyze(path)

    expected = {
        "jitter_local",
        "shimmer_local",
        "hnr_mean",
        "vibrato_rate_hz",
        "vibrato_extent_cents",
        "f1_mean",
        "f2_mean",
    }
    assert expected.issubset(result.keys())


def test_analyze_clean_sine_has_low_jitter(tmp_audio_dir):
    path = tmp_audio_dir / "clean.wav"
    tone_gen.save_sine(midi_note=60, duration_s=2.0, path=path)
    result = voice_qa.analyze(path)
    assert result["jitter_local"] < 0.02  # < 2%


def test_analyze_clean_sine_has_high_hnr(tmp_audio_dir):
    path = tmp_audio_dir / "clean.wav"
    tone_gen.save_sine(midi_note=60, duration_s=2.0, path=path)
    result = voice_qa.analyze(path)
    assert result["hnr_mean"] > 20.0  # dB


def test_analyze_detects_vibrato_rate(tmp_audio_dir):
    path = tmp_audio_dir / "vibrato.wav"
    _write_vibrato_sine(path, midi_note=60, duration_s=3.0, vibrato_rate_hz=5.5, vibrato_cents=50)
    result = voice_qa.analyze(path)
    assert result["vibrato_rate_hz"] == pytest.approx(5.5, abs=0.7)
    assert result["vibrato_extent_cents"] == pytest.approx(50.0, abs=20.0)
