"""Session orchestration: recording -> analysis -> coaching -> persistence.

Owns the data directory layout and the analysis pipeline so the UI stays thin.
"""

import shutil
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from singing_coach import (
    accuracy,
    audio_io,
    auth,
    coach,
    db,
    exercises,
    pitch,
    sync,
    voice_qa,
)
from singing_coach.models import Calibration, CoachingResult, ExerciseSpec, Measurements

DATA_DIR = Path.home() / ".singing-coach"
DB_PATH = DATA_DIR / "sessions.db"
RECORDINGS_DIR = DATA_DIR / "recordings"

HISTORY_LIMIT = 5


@dataclass
class AnalysisResult:
    """Everything the UI needs to display after analyzing one recording."""

    session_id: int
    saved_path: Path
    measurements: Measurements
    times: np.ndarray
    f0: np.ndarray
    confidence: np.ndarray
    coaching: CoachingResult | None
    coaching_error: str | None


def ensure_dirs() -> None:
    """Create the user data directories if this is a first run."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


def _save_recording(src_path: str) -> Path:
    day_dir = RECORDINGS_DIR / date.today().isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    dest = day_dir / f"{uuid.uuid4()}.wav"
    shutil.copy(src_path, dest)
    return dest


def analyze_session(audio_filepath: str, spec: ExerciseSpec | None) -> AnalysisResult:
    """Run the full pipeline for one recording: save, measure, coach, persist.

    A coaching failure is captured rather than raised — the measurements are worth
    keeping either way, and the UI offers a retry.
    """
    saved = _save_recording(audio_filepath)
    audio, sr = audio_io.load(saved)
    times, f0, confidence = pitch.predict(audio, sr)
    measurements = voice_qa.analyze(saved, contour=(times, f0, confidence))
    if spec is not None:
        measurements.accuracy = accuracy.score(spec, times, f0, confidence)

    user_id = auth.user_id()
    conn = db.connect(DB_PATH)
    try:
        history = db.recent_sessions(conn, limit=HISTORY_LIMIT, user_id=user_id)
        coaching = None
        coaching_error = None
        try:
            coaching = coach.coach(spec, measurements, history)
        except Exception as exc:
            coaching_error = str(exc)

        session_id = db.insert_session(
            conn,
            exercise_type=spec.type if spec else "free",
            exercise_spec=spec,
            audio_path=saved,
            measurements=measurements,
            coaching=coaching,
            user_id=user_id,
        )
        sync.sync_now(conn)
    finally:
        conn.close()

    return AnalysisResult(
        session_id=session_id,
        saved_path=saved,
        measurements=measurements,
        times=times,
        f0=f0,
        confidence=confidence,
        coaching=coaching,
        coaching_error=coaching_error,
    )


def retry_coaching(session_id: str) -> tuple[CoachingResult | None, str | None]:
    """Re-run coaching for a saved session. Returns (coaching, error)."""
    user_id = auth.user_id()
    conn = db.connect(DB_PATH)
    try:
        session = db.get_session(conn, session_id, user_id=user_id)
        if session is None:
            return None, "Session not found."
        history = [
            s for s in db.recent_sessions(conn, limit=HISTORY_LIMIT + 1, user_id=user_id)
            if s["id"] != session_id
        ][:HISTORY_LIMIT]
        try:
            coaching = coach.coach(
                session["exercise_spec"], session["measurements"], history
            )
        except Exception as exc:
            return None, str(exc)
        db.update_coaching(conn, session_id, coaching, user_id=user_id)
        sync.sync_now(conn)
        return coaching, None
    finally:
        conn.close()


def next_exercise() -> ExerciseSpec | None:
    """The next exercise for the user, or None if they haven't calibrated yet.

    When the most recent session has coaching, its focus area drives the
    exercise choice.
    """
    user_id = auth.user_id()
    conn = db.connect(DB_PATH)
    try:
        calibration = db.latest_calibration(conn, user_id=user_id)
        if calibration is None:
            return None
        count = db.session_count(conn, user_id=user_id)
        recent = db.recent_sessions(conn, limit=1, user_id=user_id)
    finally:
        conn.close()

    focus_area = None
    if recent and recent[0]["coaching"] is not None:
        focus_area = recent[0]["coaching"].focus_area.value
    return exercises.next_exercise(calibration, session_index=count, focus_area=focus_area)


def save_calibration(
    low_comfortable: int, high_comfortable: int, low_edge: int, high_edge: int
) -> None:
    """Store a new calibration; the edges become the range, comfortables the tessitura."""
    conn = db.connect(DB_PATH)
    try:
        db.insert_calibration(
            conn,
            range_low=low_edge,
            range_high=high_edge,
            tessitura_low=low_comfortable,
            tessitura_high=high_comfortable,
            user_id=auth.user_id(),
        )
        sync.sync_now(conn)
    finally:
        conn.close()


def latest_calibration() -> Calibration | None:
    """The active calibration, or None if the user has not calibrated yet."""
    conn = db.connect(DB_PATH)
    try:
        return db.latest_calibration(conn, user_id=auth.user_id())
    finally:
        conn.close()


def all_sessions() -> list[dict]:
    """Every logged session, newest first."""
    conn = db.connect(DB_PATH)
    try:
        return db.all_sessions(conn, user_id=auth.user_id())
    finally:
        conn.close()


def audio_available(session_audio_path: str | Path | None) -> bool:
    """Whether a session's recording exists on this machine.

    Sessions pulled down from another device carry no audio — recordings never
    leave the machine that made them — so playback has to degrade rather than 404.
    """
    return bool(session_audio_path) and Path(session_audio_path).exists()


def sync_now() -> sync.SyncReport:
    """Run one sync pass against Supabase and report what happened."""
    conn = db.connect(DB_PATH)
    try:
        return sync.sync_now(conn)
    finally:
        conn.close()


def sign_in(email: str, password: str) -> tuple[dict | None, str]:
    """Sign in, adopt any work done while signed out, then sync. Returns (user, message)."""
    try:
        user = auth.sign_in(email, password)
    except auth.AuthError as exc:
        return None, f"⚠️ {exc}"
    return user, _adopt_and_sync(user)


def sign_up(email: str, password: str) -> tuple[dict | None, str]:
    """Create an account, then behave exactly as a sign-in. Returns (user, message)."""
    try:
        user = auth.sign_up(email, password)
    except auth.AuthError as exc:
        return None, f"⚠️ {exc}"
    return user, _adopt_and_sync(user)


def restore_session() -> dict | None:
    """Re-establish a cached sign-in on launch, syncing if one is found."""
    user = auth.restore()
    if user is not None:
        _adopt_and_sync(user)
    return user


def _adopt_and_sync(user: dict) -> str:
    conn = db.connect(DB_PATH)
    try:
        claimed = db.claim_orphaned_rows(conn, user["id"])
        report = sync.sync_now(conn)
    finally:
        conn.close()
    if claimed:
        return f"Signed in as {user['email']}. Adopted {claimed} local rows. {report.summary()}"
    return f"Signed in as {user['email']}. {report.summary()}"
