"""SQLite persistence for calibration and exercise sessions."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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
  coaching_md TEXT NOT NULL
);
"""


def connect(db_path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.executescript(DDL)
    conn.commit()
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_calibration(
    conn: sqlite3.Connection,
    range_low: int,
    range_high: int,
    tessitura_low: int | None,
    tessitura_high: int | None,
) -> int:
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


def latest_calibration(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute(
        "SELECT * FROM calibration ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def insert_session(
    conn: sqlite3.Connection,
    exercise_type: str,
    exercise_spec: dict | None,
    audio_path: Path | str,
    measurements: dict,
    coaching_md: str,
) -> int:
    cursor = conn.execute(
        """
        INSERT INTO sessions
          (ts, exercise_type, exercise_spec_json, audio_path, measurements_json, coaching_md)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            _now_iso(),
            exercise_type,
            json.dumps(exercise_spec) if exercise_spec is not None else None,
            str(audio_path),
            json.dumps(measurements),
            coaching_md,
        ),
    )
    conn.commit()
    return cursor.lastrowid


def _hydrate(row) -> dict:
    d = dict(row)
    spec_json = d.pop("exercise_spec_json")
    d["exercise_spec"] = json.loads(spec_json) if spec_json is not None else None
    d["measurements"] = json.loads(d.pop("measurements_json"))
    return d


def recent_sessions(conn: sqlite3.Connection, limit: int = 5) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM sessions ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [_hydrate(row) for row in rows]


def all_sessions(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM sessions ORDER BY id DESC").fetchall()
    return [_hydrate(row) for row in rows]
