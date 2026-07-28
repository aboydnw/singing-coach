"""Two-way sync between the local outbox and Supabase.

Local SQLite is always the durable write path: singing works offline and a failed
sync never blocks coaching. Supabase is canonical for the complete picture across
devices. Rows with ``synced_at IS NULL`` are the outbox; the pull step fills in
anything this device has never seen.

Audio never leaves the machine that recorded it. The local ``audio_path`` is
stripped on upload as well — it is a local filesystem path that would leak the
account's directory layout and means nothing on another device.
"""

from dataclasses import dataclass, field

from singing_coach import auth, db

SESSION_COLUMNS = (
    "id",
    "user_id",
    "ts",
    "exercise_type",
    "exercise_spec_json",
    "measurements_json",
    "coaching_md",
    "coaching_json",
)
CALIBRATION_COLUMNS = (
    "id",
    "user_id",
    "ts",
    "range_low_midi",
    "range_high_midi",
    "tessitura_low_midi",
    "tessitura_high_midi",
)


@dataclass
class SyncReport:
    """What one sync run did, and why it stopped if it did."""

    pushed: int = 0
    pulled: int = 0
    error: str | None = None
    skipped: str | None = None

    def summary(self) -> str:
        if self.skipped:
            return self.skipped
        if self.error:
            return f"⚠️ Sync failed: {self.error}"
        if not self.pushed and not self.pulled:
            return "✅ Up to date."
        parts = []
        if self.pushed:
            parts.append(f"{self.pushed} backed up")
        if self.pulled:
            parts.append(f"{self.pulled} restored")
        return "✅ " + ", ".join(parts) + "."


@dataclass
class _Table:
    name: str
    columns: tuple[str, ...]
    insert_remote: callable = field(repr=False, default=None)


TABLES = (
    _Table("calibration", CALIBRATION_COLUMNS, db.insert_remote_calibration),
    _Table("sessions", SESSION_COLUMNS, db.insert_remote_session),
)


def _payload(row: dict, columns: tuple[str, ...]) -> dict:
    return {column: row.get(column) for column in columns}


def _push(conn, client, table: _Table, user_id: str) -> int:
    pending = db.unsynced(conn, table.name, user_id)
    if not pending:
        return 0
    client.table(table.name).upsert(
        [_payload(row, table.columns) for row in pending]
    ).execute()
    db.mark_synced(conn, table.name, [row["id"] for row in pending])
    return len(pending)


def _pull(conn, client, table: _Table, user_id: str) -> int:
    response = client.table(table.name).select("*").eq("user_id", user_id).execute()
    held = db.existing_ids(conn, table.name, user_id)
    fetched = 0
    for row in response.data or []:
        if row["id"] in held:
            continue
        table.insert_remote(conn, row)
        fetched += 1
    return fetched


def sync_now(conn) -> SyncReport:
    """Push the outbox, then pull anything missing. Never raises.

    A backup that fails is reported and retried on the next run rather than
    interrupting a practice session.
    """
    if not auth.is_configured():
        return SyncReport(skipped="Sync is off — Supabase is not configured.")
    user_id = auth.user_id()
    if user_id is None:
        return SyncReport(skipped="Sync is off — sign in to back up your history.")

    report = SyncReport()
    try:
        client = auth.client()
        for table in TABLES:
            report.pushed += _push(conn, client, table, user_id)
        for table in TABLES:
            report.pulled += _pull(conn, client, table, user_id)
    except Exception as exc:
        report.error = str(exc)
    return report


def pending_count(conn) -> int:
    """How many local rows are still waiting to reach Supabase."""
    user_id = auth.user_id()
    if user_id is None:
        return 0
    return sum(len(db.unsynced(conn, table.name, user_id)) for table in TABLES)
