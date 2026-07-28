"""SQLite persistence for calibration and exercise sessions.

Rows carry UUID primary keys so any device can write without coordinating, and a
``synced_at`` column that acts as an outbox marker: NULL means the row has not yet
reached Supabase. ``user_id`` scopes rows to the signed-in account, and is NULL for
work done while signed out.
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from singing_coach.models import Calibration, CoachingResult, ExerciseSpec, Measurements

DDL = """
CREATE TABLE IF NOT EXISTS calibration (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ts TEXT NOT NULL,
  range_low_midi INTEGER NOT NULL,
  range_high_midi INTEGER NOT NULL,
  tessitura_low_midi INTEGER,
  tessitura_high_midi INTEGER,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ts TEXT NOT NULL,
  exercise_type TEXT NOT NULL,
  exercise_spec_json TEXT,
  audio_path TEXT NOT NULL,
  measurements_json TEXT NOT NULL,
  coaching_md TEXT NOT NULL,
  coaching_json TEXT,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS sessions_unsynced ON sessions (synced_at);
CREATE INDEX IF NOT EXISTS calibration_unsynced ON calibration (synced_at);
"""

LEGACY_SUFFIX = "_legacy_v1"


def connect(db_path: Path | str) -> sqlite3.Connection:
    """Open the session database, creating or migrating the schema as needed."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    _archive_legacy_tables(conn)
    conn.executescript(DDL)
    conn.commit()
    return conn


def _archive_legacy_tables(conn: sqlite3.Connection) -> None:
    """Set aside pre-UUID tables rather than migrating or dropping them.

    The old schema used autoincrementing integer ids, which collide the moment two
    devices sync. Renaming keeps the rows recoverable without carrying migration
    code for a personal tool's throwaway test data.
    """
    for table in ("sessions", "calibration"):
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if columns and "synced_at" not in columns:
            conn.execute(f"ALTER TABLE {table} RENAME TO {table}{LEGACY_SUFFIX}")
    conn.commit()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


def insert_calibration(
    conn: sqlite3.Connection,
    range_low: int,
    range_high: int,
    tessitura_low: int | None,
    tessitura_high: int | None,
    user_id: str | None = None,
) -> str:
    """Record a calibration and return its id. The newest row is the active one."""
    if range_low > range_high:
        raise ValueError("range_low must be <= range_high")
    if (tessitura_low is None) != (tessitura_high is None):
        raise ValueError("tessitura_low and tessitura_high must both be set or both be None")
    if tessitura_low is not None and tessitura_high is not None:
        if tessitura_low > tessitura_high:
            raise ValueError("tessitura_low must be <= tessitura_high")
        if tessitura_low < range_low or tessitura_high > range_high:
            raise ValueError("tessitura must be within calibrated range")

    calibration_id = _new_id()
    conn.execute(
        """
        INSERT INTO calibration
          (id, user_id, ts, range_low_midi, range_high_midi,
           tessitura_low_midi, tessitura_high_midi, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            calibration_id,
            user_id,
            _now_iso(),
            range_low,
            range_high,
            tessitura_low,
            tessitura_high,
        ),
    )
    conn.commit()
    return calibration_id


def latest_calibration(
    conn: sqlite3.Connection, user_id: str | None = None
) -> Calibration | None:
    """The most recent calibration for this account, or None if there is none."""
    row = conn.execute(
        "SELECT * FROM calibration WHERE user_id IS ? ORDER BY ts DESC, id DESC LIMIT 1",
        (user_id,),
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
    user_id: str | None = None,
) -> str:
    """Persist one analyzed session and return its id.

    Coaching may be None when the call failed; the measurements are still saved
    so the user can retry coaching later.
    """
    session_id = _new_id()
    conn.execute(
        """
        INSERT INTO sessions
          (id, user_id, ts, exercise_type, exercise_spec_json, audio_path,
           measurements_json, coaching_md, coaching_json, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            session_id,
            user_id,
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
    return session_id


def update_coaching(
    conn: sqlite3.Connection, session_id: str, coaching: CoachingResult
) -> None:
    """Replace the stored coaching for a session, after a successful retry.

    Clears synced_at so the corrected row is pushed again.
    """
    conn.execute(
        "UPDATE sessions SET coaching_md = ?, coaching_json = ?, synced_at = NULL WHERE id = ?",
        (coaching.to_markdown(), coaching.model_dump_json(), session_id),
    )
    conn.commit()


def get_session(conn: sqlite3.Connection, session_id: str) -> dict | None:
    """One session with its JSON columns hydrated into models, or None if absent."""
    row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return _hydrate(row) if row is not None else None


def session_count(conn: sqlite3.Connection, user_id: str | None = None) -> int:
    """Total number of logged sessions for this account."""
    return conn.execute(
        "SELECT COUNT(*) FROM sessions WHERE user_id IS ?", (user_id,)
    ).fetchone()[0]


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


def recent_sessions(
    conn: sqlite3.Connection, limit: int = 5, user_id: str | None = None
) -> list[dict]:
    """The most recent sessions, newest first — the coach's memory of prior work."""
    rows = conn.execute(
        "SELECT * FROM sessions WHERE user_id IS ? ORDER BY ts DESC, id DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    return [_hydrate(row) for row in rows]


def all_sessions(conn: sqlite3.Connection, user_id: str | None = None) -> list[dict]:
    """Every session for this account, newest first, for the progress charts."""
    rows = conn.execute(
        "SELECT * FROM sessions WHERE user_id IS ? ORDER BY ts DESC, id DESC", (user_id,)
    ).fetchall()
    return [_hydrate(row) for row in rows]


def claim_orphaned_rows(conn: sqlite3.Connection, user_id: str) -> int:
    """Assign rows recorded while signed out to an account, and queue them for sync.

    Without this, work done before signing in would be stranded: invisible to the
    signed-in view and never backed up.
    """
    total = 0
    for table in ("sessions", "calibration"):
        cursor = conn.execute(
            f"UPDATE {table} SET user_id = ?, synced_at = NULL WHERE user_id IS NULL",
            (user_id,),
        )
        total += cursor.rowcount
    conn.commit()
    return total


def unsynced(conn: sqlite3.Connection, table: str, user_id: str) -> list[dict]:
    """Raw rows still waiting to reach Supabase, oldest first."""
    if table not in ("sessions", "calibration"):
        raise ValueError(f"unknown table: {table}")
    rows = conn.execute(
        f"SELECT * FROM {table} WHERE user_id = ? AND synced_at IS NULL ORDER BY ts",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def mark_synced(conn: sqlite3.Connection, table: str, ids: list[str]) -> None:
    """Record that rows have reached Supabase, removing them from the outbox."""
    if table not in ("sessions", "calibration"):
        raise ValueError(f"unknown table: {table}")
    if not ids:
        return
    placeholders = ",".join("?" for _ in ids)
    conn.execute(
        f"UPDATE {table} SET synced_at = ? WHERE id IN ({placeholders})",
        (_now_iso(), *ids),
    )
    conn.commit()


def existing_ids(conn: sqlite3.Connection, table: str, user_id: str) -> set[str]:
    """Ids already held locally, used to skip rows on the way down from Supabase."""
    if table not in ("sessions", "calibration"):
        raise ValueError(f"unknown table: {table}")
    rows = conn.execute(f"SELECT id FROM {table} WHERE user_id = ?", (user_id,))
    return {row[0] for row in rows}


def insert_remote_session(conn: sqlite3.Connection, row: dict) -> None:
    """Store a session pulled from Supabase, already marked as synced.

    The audio file lives on whichever device recorded it, so audio_path may point
    at nothing here — the UI checks for the file rather than trusting the path.
    """
    conn.execute(
        """
        INSERT OR IGNORE INTO sessions
          (id, user_id, ts, exercise_type, exercise_spec_json, audio_path,
           measurements_json, coaching_md, coaching_json, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["id"],
            row["user_id"],
            row["ts"],
            row["exercise_type"],
            row.get("exercise_spec_json"),
            row.get("audio_path") or "",
            row["measurements_json"],
            row.get("coaching_md") or "",
            row.get("coaching_json"),
            _now_iso(),
        ),
    )
    conn.commit()


def insert_remote_calibration(conn: sqlite3.Connection, row: dict) -> None:
    """Store a calibration pulled from Supabase, already marked as synced."""
    conn.execute(
        """
        INSERT OR IGNORE INTO calibration
          (id, user_id, ts, range_low_midi, range_high_midi,
           tessitura_low_midi, tessitura_high_midi, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["id"],
            row["user_id"],
            row["ts"],
            row["range_low_midi"],
            row["range_high_midi"],
            row.get("tessitura_low_midi"),
            row.get("tessitura_high_midi"),
            _now_iso(),
        ),
    )
    conn.commit()
