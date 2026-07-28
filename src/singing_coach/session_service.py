"""Session orchestration: recording -> analysis -> coaching -> persistence.

Owns the data directory layout and the analysis pipeline so the UI stays thin.
"""

import shutil
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from singing_coach import accuracy, audio_io, coach, db, exercises, pitch, voice_qa
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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


def _save_recording(src_path: str) -> Path:
    day_dir = RECORDINGS_DIR / date.today().isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    dest = day_dir / f"{uuid.uuid4()}.wav"
    shutil.copy(src_path, dest)
    return dest


def analyze_session(audio_filepath: str, spec: ExerciseSpec | None) -> AnalysisResult:
    saved = _save_recording(audio_filepath)
    audio, sr = audio_io.load(saved)
    times, f0, confidence = pitch.predict(audio, sr)
    measurements = voice_qa.analyze(saved, contour=(times, f0, confidence))
    if spec is not None:
        measurements.accuracy = accuracy.score(spec, times, f0, confidence)

    conn = db.connect(DB_PATH)
    try:
        history = db.recent_sessions(conn, limit=HISTORY_LIMIT)
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
        )
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


def retry_coaching(session_id: int) -> tuple[CoachingResult | None, str | None]:
    """Re-run coaching for a saved session. Returns (coaching, error)."""
    conn = db.connect(DB_PATH)
    try:
        session = db.get_session(conn, session_id)
        if session is None:
            return None, "Session not found."
        history = [
            s for s in db.recent_sessions(conn, limit=HISTORY_LIMIT + 1)
            if s["id"] != session_id
        ][:HISTORY_LIMIT]
        try:
            coaching = coach.coach(
                session["exercise_spec"], session["measurements"], history
            )
        except Exception as exc:
            return None, str(exc)
        db.update_coaching(conn, session_id, coaching)
        return coaching, None
    finally:
        conn.close()


def next_exercise() -> ExerciseSpec | None:
    """The next exercise for the user, or None if they haven't calibrated yet.

    When the most recent session has coaching, its focus area drives the
    exercise choice.
    """
    conn = db.connect(DB_PATH)
    try:
        calibration = db.latest_calibration(conn)
        if calibration is None:
            return None
        count = db.session_count(conn)
        recent = db.recent_sessions(conn, limit=1)
    finally:
        conn.close()

    focus_area = None
    if recent and recent[0]["coaching"] is not None:
        focus_area = recent[0]["coaching"].focus_area.value
    return exercises.next_exercise(calibration, session_index=count, focus_area=focus_area)


def save_calibration(
    low_comfortable: int, high_comfortable: int, low_edge: int, high_edge: int
) -> None:
    conn = db.connect(DB_PATH)
    try:
        db.insert_calibration(
            conn,
            range_low=low_edge,
            range_high=high_edge,
            tessitura_low=low_comfortable,
            tessitura_high=high_comfortable,
        )
    finally:
        conn.close()


def latest_calibration() -> Calibration | None:
    conn = db.connect(DB_PATH)
    try:
        return db.latest_calibration(conn)
    finally:
        conn.close()


def all_sessions() -> list[dict]:
    conn = db.connect(DB_PATH)
    try:
        return db.all_sessions(conn)
    finally:
        conn.close()
