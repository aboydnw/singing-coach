import numpy as np
import pytest

from singing_coach import db, session_service, tone_gen
from singing_coach.models import (
    CoachingResult,
    ExerciseSpec,
    Measurements,
)

COACHING = CoachingResult(
    focus_area="pitch_accuracy",
    top_issue="Center the pitch",
    why="You ran flat.",
    drill="Slow scale with a tuner.",
    encouragement="Solid breath control.",
)

SPEC = ExerciseSpec(
    type="sustained",
    target_notes_midi=[60],
    duration_per_note_s=3.0,
    vowel="ah",
    display_name="sustained on 'ah', starting C4",
)


@pytest.fixture
def service_env(tmp_path, monkeypatch):
    monkeypatch.setattr(session_service, "DATA_DIR", tmp_path)
    monkeypatch.setattr(session_service, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(session_service, "RECORDINGS_DIR", tmp_path / "recordings")
    session_service.ensure_dirs()
    return tmp_path


@pytest.fixture
def recording(tmp_path):
    path = tmp_path / "attempt.wav"
    tone_gen.save_sine(midi_note=60, duration_s=2.0, path=path)
    return path


@pytest.fixture
def fake_coach(monkeypatch):
    calls = []

    def _coach(spec, measurements, history):
        calls.append({"spec": spec, "measurements": measurements, "history": history})
        return COACHING

    monkeypatch.setattr(session_service.coach, "coach", _coach)
    return calls


def test_analyze_session_persists_and_returns_everything(service_env, recording, fake_coach):
    result = session_service.analyze_session(str(recording), SPEC)

    assert isinstance(result.session_id, str)
    assert result.saved_path.exists()
    assert isinstance(result.measurements, Measurements)
    assert result.coaching == COACHING
    assert result.coaching_error is None
    assert result.f0.size > 0

    conn = db.connect(session_service.DB_PATH)
    session = db.get_session(conn, result.session_id)
    conn.close()
    assert session["exercise_type"] == "sustained"
    assert session["coaching"] == COACHING


def test_analyze_session_computes_accuracy_for_exercises(service_env, recording, fake_coach):
    result = session_service.analyze_session(str(recording), SPEC)
    assert result.measurements.accuracy is not None
    assert result.measurements.accuracy.per_note[0].target_name == "C4"


def test_analyze_session_skips_accuracy_for_free_sing(service_env, recording, fake_coach):
    result = session_service.analyze_session(str(recording), None)
    assert result.measurements.accuracy is None

    conn = db.connect(session_service.DB_PATH)
    session = db.get_session(conn, result.session_id)
    conn.close()
    assert session["exercise_type"] == "free"


def test_analyze_session_saves_even_when_coaching_fails(service_env, recording, monkeypatch):
    def _boom(spec, measurements, history):
        raise RuntimeError("api down")

    monkeypatch.setattr(session_service.coach, "coach", _boom)

    result = session_service.analyze_session(str(recording), None)

    assert result.coaching is None
    assert result.coaching_error is not None
    conn = db.connect(session_service.DB_PATH)
    assert db.session_count(conn) == 1
    conn.close()


def test_retry_coaching_updates_the_session(service_env, recording, monkeypatch):
    def _boom(spec, measurements, history):
        raise RuntimeError("api down")

    monkeypatch.setattr(session_service.coach, "coach", _boom)
    result = session_service.analyze_session(str(recording), None)

    monkeypatch.setattr(session_service.coach, "coach", lambda *a, **k: COACHING)
    coaching, error = session_service.retry_coaching(result.session_id)

    assert error is None
    assert coaching == COACHING
    conn = db.connect(session_service.DB_PATH)
    session = db.get_session(conn, result.session_id)
    conn.close()
    assert session["coaching"] == COACHING


def test_retry_coaching_unknown_session(service_env):
    coaching, error = session_service.retry_coaching("no-such-session")
    assert coaching is None
    assert error is not None


def test_audio_available_tracks_the_file_not_the_path(service_env, recording):
    assert session_service.audio_available(recording) is True
    assert session_service.audio_available(service_env / "gone.wav") is False
    assert session_service.audio_available("") is False
    assert session_service.audio_available(None) is False


def test_next_exercise_requires_calibration(service_env):
    assert session_service.next_exercise() is None


def test_next_exercise_follows_last_coaching_focus(service_env, recording, fake_coach):
    session_service.save_calibration(55, 67, 48, 72)
    session_service.analyze_session(str(recording), None)

    spec = session_service.next_exercise()

    # Last coaching focus is pitch_accuracy -> scale exercise.
    assert spec.type == "scale"
    assert "pitch accuracy" in spec.display_name


def test_next_exercise_rotates_without_coaching_history(service_env):
    session_service.save_calibration(55, 67, 48, 72)
    spec = session_service.next_exercise()
    assert spec.type == "sustained"


def test_coach_receives_history_from_prior_sessions(service_env, recording, fake_coach):
    session_service.analyze_session(str(recording), None)
    session_service.analyze_session(str(recording), None)

    history = fake_coach[1]["history"]
    assert len(history) == 1
    assert history[0]["coaching"] == COACHING
