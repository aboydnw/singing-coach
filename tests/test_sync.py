import pytest

from singing_coach import db, sync
from singing_coach.models import Measurements

USER = "user-a"


class FakeTable:
    def __init__(self, name, store, fail=None):
        self.name = name
        self.store = store
        self.fail = fail
        self._filter = None

    def upsert(self, rows):
        if self.fail:
            raise RuntimeError(self.fail)
        self.store.setdefault(self.name, {})
        for row in rows:
            self.store[self.name][row["id"]] = row
        return self

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self._filter = (column, value)
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError(self.fail)
        rows = list(self.store.get(self.name, {}).values())
        if self._filter:
            column, value = self._filter
            rows = [row for row in rows if row.get(column) == value]
        return FakeResponse(rows)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeClient:
    def __init__(self, store=None, fail=None):
        self.store = store if store is not None else {}
        self.fail = fail

    def table(self, name):
        return FakeTable(name, self.store, self.fail)


@pytest.fixture
def conn():
    c = db.connect(":memory:")
    yield c
    c.close()


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setattr(sync.auth, "is_configured", lambda: True)
    monkeypatch.setattr(sync.auth, "user_id", lambda: USER)


def _use(monkeypatch, client):
    monkeypatch.setattr(sync.auth, "client", lambda: client)
    return client


def _add_session(conn, user_id=USER, audio_path="/tmp/a.wav"):
    return db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path=audio_path,
        measurements=Measurements(jitter_local=0.01),
        coaching=None,
        user_id=user_id,
    )


def test_sync_is_skipped_when_supabase_is_unconfigured(conn, monkeypatch):
    monkeypatch.setattr(sync.auth, "is_configured", lambda: False)
    report = sync.sync_now(conn)
    assert report.skipped is not None
    assert report.pushed == 0


def test_sync_is_skipped_when_signed_out(conn, monkeypatch):
    monkeypatch.setattr(sync.auth, "is_configured", lambda: True)
    monkeypatch.setattr(sync.auth, "user_id", lambda: None)
    report = sync.sync_now(conn)
    assert "sign in" in report.skipped.lower()


def test_sync_pushes_the_outbox_and_empties_it(conn, signed_in, monkeypatch):
    session_id = _add_session(conn)
    client = _use(monkeypatch, FakeClient())

    report = sync.sync_now(conn)

    assert report.pushed == 1
    assert session_id in client.store["sessions"]
    assert db.unsynced(conn, "sessions", USER) == []


def test_sync_never_uploads_the_local_audio_path(conn, signed_in, monkeypatch):
    _add_session(conn, audio_path="/home/anthony/.singing-coach/recordings/x.wav")
    client = _use(monkeypatch, FakeClient())

    sync.sync_now(conn)

    uploaded = next(iter(client.store["sessions"].values()))
    assert "audio_path" not in uploaded
    assert "anthony" not in str(uploaded)


def test_sync_pulls_rows_recorded_on_another_device(conn, signed_in, monkeypatch):
    remote_id = "44444444-4444-4444-4444-444444444444"
    store = {
        "sessions": {
            remote_id: {
                "id": remote_id,
                "user_id": USER,
                "ts": "2026-07-01T09:00:00+00:00",
                "exercise_type": "scale",
                "measurements_json": '{"jitter_local": 0.02}',
                "coaching_md": "remote advice",
            }
        }
    }
    _use(monkeypatch, FakeClient(store))

    report = sync.sync_now(conn)

    assert report.pulled == 1
    pulled = db.all_sessions(conn, user_id=USER)[0]
    assert pulled["id"] == remote_id
    assert pulled["audio_path"] == ""


def test_sync_does_not_re_pull_rows_it_just_pushed(conn, signed_in, monkeypatch):
    _add_session(conn)
    client = _use(monkeypatch, FakeClient())

    sync.sync_now(conn)
    second = sync.sync_now(conn)

    assert second.pushed == 0
    assert second.pulled == 0
    assert db.session_count(conn, user_id=USER) == 1
    assert client is not None


def test_sync_reports_failure_without_raising(conn, signed_in, monkeypatch):
    _add_session(conn)
    _use(monkeypatch, FakeClient(fail="network unreachable"))

    report = sync.sync_now(conn)

    assert report.error is not None
    assert "Sync failed" in report.summary()


def test_a_failed_push_leaves_the_row_in_the_outbox(conn, signed_in, monkeypatch):
    session_id = _add_session(conn)
    _use(monkeypatch, FakeClient(fail="network unreachable"))

    sync.sync_now(conn)

    assert [row["id"] for row in db.unsynced(conn, "sessions", USER)] == [session_id]


def test_calibration_syncs_alongside_sessions(conn, signed_in, monkeypatch):
    db.insert_calibration(
        conn, range_low=48, range_high=64, tessitura_low=51, tessitura_high=58,
        user_id=USER,
    )
    client = _use(monkeypatch, FakeClient())

    report = sync.sync_now(conn)

    assert report.pushed == 1
    assert len(client.store["calibration"]) == 1


def test_pending_count_reports_the_outbox_depth(conn, signed_in):
    _add_session(conn)
    _add_session(conn)
    assert sync.pending_count(conn) == 2


def test_pending_count_is_zero_when_signed_out(conn, monkeypatch):
    monkeypatch.setattr(sync.auth, "user_id", lambda: None)
    _add_session(conn)
    assert sync.pending_count(conn) == 0


def test_summary_reads_naturally_when_nothing_changed():
    assert sync.SyncReport().summary() == "✅ Up to date."


def test_summary_counts_both_directions():
    summary = sync.SyncReport(pushed=2, pulled=3).summary()
    assert "2 backed up" in summary
    assert "3 restored" in summary
