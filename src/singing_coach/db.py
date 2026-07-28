"""SQLite persistence for calibration and exercise sessions."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from singing_coach.models import Calibration, CoachingResult, ExerciseSpec, Measurements

DDL = """
CREATE TABLE IF NOT EXISTS calibration (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  range_low_midi INTEGER NOT NULL,
  range_high_midi INTEGER NOT NULL,
  tessitura_low_midi INTEGER,
  tessitura_high_midi INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  exercise_type TEXT NOT NULL,
  exercise_spec_json TEXT,
  audio_path TEXT NOT NULL,
  measurements_json TEXT NOT NULL,
  coaching_md TEXT NOT NULL,
  coaching_json TEXT
);
"""


def connect(db_path: Path | str) -> sqlite3.Connection:
    """Open the session database, creating or migrating the schema as needed."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.executescript(DDL)
    _migrate(conn)
    conn.commit()
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
    if "coaching_json" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN coaching_json TEXT")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_calibration(
    conn: sqlite3.Connection,
    range_low: int,
    range_high: int,
    tessitura_low: int | None,
    tessitura_high: int | None,
) -> int:
    """Record a calibration and return its row id. The newest row is the active one."""
    if range_low > range_high:
        raise ValueError("range_low must be <= range_high")
    if (tessitura_low is None) != (tessitura_high is None):
        raise ValueError("tessitura_low and tessitura_high must both be set or both be None")
    if tessitura_low is not None and tessitura_high is not None:
        if tessitura_low > tessitura_high:
            raise ValueError("tessitura_low must be <= tessitura_high")
        if tessitura_low < range_low or tessitura_high > range_high:
            raise ValueError("tessitura must be within calibrated range")

    cursor = conn.execute(
        """
        INSERT INTO calibration
          (ts, range_low_midi, range_high_midi, tessitura_low_midi, tessitura_high_midi)
        VALUES (?, ?, ?, ?, ?)
        """,
        (_now_iso(), range_low, range_high, tessitura_low, tessitura_high),
    )
    conn.commit()
    return cursor.lastrowid


def latest_calibration(conn: sqlite3.Connection) -> Calibration | None:
    """The most recent calibration, or None if the user has never calibrated."""
    row = conn.execute(
        "SELECT * FROM calibration ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    return Calibration.model_validate(dict(row))


def insert_session(
    conn: sqlite3.Connection,
    exercise_type: str,
    exercise_spec: ExerciseSpec | None,
    audio_path: Path | str,
    measurements: Measurements,
    coaching: CoachingResult | None,
) -> int:
    """Persist one analyzed session and return its row id.

    Coaching may be None when the API call failed; the measurements are still saved
    so the user can retry coaching later.
    """
    cursor = conn.execute(
        """
        INSERT INTO sessions
          (ts, exercise_type, exercise_spec_json, audio_path, measurements_json,
           coaching_md, coaching_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            _now_iso(),
            exercise_type,
            exercise_spec.model_dump_json() if exercise_spec is not None else None,
            str(audio_path),
            measurements.model_dump_json(),
            coaching.to_markdown() if coaching is not None else "",
            coaching.model_dump_json() if coaching is not None else None,
        ),
    )
    conn.commit()
    return cursor.lastrowid


def update_coaching(
    conn: sqlite3.Connection, session_id: int, coaching: CoachingResult
) -> None:
    """Replace the stored coaching for a session, after a successful retry."""
    conn.execute(
        "UPDATE sessions SET coaching_md = ?, coaching_json = ? WHERE id = ?",
        (coaching.to_markdown(), coaching.model_dump_json(), session_id),
    )
    conn.commit()


def get_session(conn: sqlite3.Connection, session_id: int) -> dict | None:
    """One session with its JSON columns hydrated into models, or None if absent."""
    row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return _hydrate(row) if row is not None else None


def session_count(conn: sqlite3.Connection) -> int:
    """Total number of logged sessions."""
    return conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]


def _hydrate(row) -> dict:
    d = dict(row)
    spec_json = d.pop("exercise_spec_json")
    d["exercise_spec"] = (
        ExerciseSpec.model_validate_json(spec_json) if spec_json is not None else None
    )
    d["measurements"] = Measurements.model_validate_json(d.pop("measurements_json"))
    coaching_json = d.pop("coaching_json", None)
    d["coaching"] = (
        CoachingResult.model_validate_json(coaching_json)
        if coaching_json is not None
        else None
    )
    return d


def recent_sessions(conn: sqlite3.Connection, limit: int = 5) -> list[dict]:
    """The most recent sessions, newest first — the coach's memory of prior work."""
    rows = conn.execute(
        "SELECT * FROM sessions ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [_hydrate(row) for row in rows]


def all_sessions(conn: sqlite3.Connection) -> list[dict]:
    """Every session, newest first, for the progress charts."""
    rows = conn.execute("SELECT * FROM sessions ORDER BY id DESC").fetchall()
    return [_hydrate(row) for row in rows]
