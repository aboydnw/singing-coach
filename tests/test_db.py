import pytest

from singing_coach import db
from singing_coach.models import CoachingResult, ExerciseSpec, Measurements

SCALE_SPEC = ExerciseSpec(
    type="scale",
    target_notes_midi=[60, 62, 64],
    duration_per_note_s=0.5,
    vowel="ah",
    display_name="scale on 'ah', starting C4",
)

COACHING = CoachingResult(
    focus_area="breath_support",
    top_issue="Steady the airflow",
    why="Jitter is elevated.",
    drill="Hiss for 20 seconds.",
    encouragement="Nice clear tone.",
)


def _measurements(**overrides) -> Measurements:
    return Measurements(jitter_local=0.01, hnr_mean=22.5, **overrides)


@pytest.fixture
def conn():
    c = db.connect(":memory:")
    yield c
    c.close()


def test_connect_creates_calibration_and_sessions_tables(conn):
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    table_names = [row[0] for row in cursor.fetchall()]
    assert "calibration" in table_names
    assert "sessions" in table_names


def test_connect_is_idempotent(tmp_path):
    db_path = tmp_path / "sessions.db"
    c1 = db.connect(db_path)
    c1.close()
    c2 = db.connect(db_path)
    cursor = c2.execute("SELECT name FROM sqlite_master WHERE type='table'")
    assert {row[0] for row in cursor.fetchall()} >= {"calibration", "sessions"}
    c2.close()


def _write_legacy_db(db_path):
    import sqlite3

    old = sqlite3.connect(db_path)
    old.executescript(
        """
        CREATE TABLE calibration (
          id INTEGER PRIMARY KEY, ts TEXT NOT NULL,
          range_low_midi INTEGER NOT NULL, range_high_midi INTEGER NOT NULL,
          tessitura_low_midi INTEGER, tessitura_high_midi INTEGER
        );
        CREATE TABLE sessions (
          id INTEGER PRIMARY KEY, ts TEXT NOT NULL, exercise_type TEXT NOT NULL,
          exercise_spec_json TEXT, audio_path TEXT NOT NULL,
          measurements_json TEXT NOT NULL, coaching_md TEXT NOT NULL
        );
        INSERT INTO sessions
          (ts, exercise_type, exercise_spec_json, audio_path, measurements_json, coaching_md)
        VALUES ('2026-01-01T00:00:00+00:00', 'free', NULL, '/tmp/a.wav',
                '{"jitter_local": 0.01}', 'old feedback');
        """
    )
    old.commit()
    old.close()


def test_connect_archives_the_pre_uuid_schema(tmp_path):
    db_path = tmp_path / "old.db"
    _write_legacy_db(db_path)

    conn = db.connect(db_path)

    assert db.all_sessions(conn) == []
    archived = conn.execute(
        f"SELECT COUNT(*) FROM sessions{db.LEGACY_SUFFIX}"
    ).fetchone()[0]
    assert archived == 1
    conn.close()


def test_connect_leaves_the_new_schema_alone_on_reopen(tmp_path):
    db_path = tmp_path / "old.db"
    _write_legacy_db(db_path)

    first = db.connect(db_path)
    session_id = db.insert_session(
        first,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/new.wav",
        measurements=_measurements(),
        coaching=None,
    )
    first.close()

    second = db.connect(db_path)
    assert [s["id"] for s in db.all_sessions(second)] == [session_id]
    second.close()


def test_insert_calibration_returns_a_uuid(conn):
    row_id = db.insert_calibration(
        conn,
        range_low=48,
        range_high=72,
        tessitura_low=55,
        tessitura_high=67,
    )
    assert isinstance(row_id, str)
    assert len(row_id) == 36


def test_latest_calibration_returns_none_when_empty(conn):
    assert db.latest_calibration(conn) is None


def test_latest_calibration_returns_most_recent_row(conn):
    db.insert_calibration(conn, range_low=40, range_high=60, tessitura_low=45, tessitura_high=55)
    db.insert_calibration(conn, range_low=48, range_high=72, tessitura_low=55, tessitura_high=67)

    latest = db.latest_calibration(conn)

    assert latest.range_low_midi == 48
    assert latest.range_high_midi == 72
    assert latest.tessitura_low_midi == 55
    assert latest.tessitura_high_midi == 67


def test_insert_session_returns_a_uuid(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="scale",
        exercise_spec=SCALE_SPEC,
        audio_path="/tmp/test.wav",
        measurements=_measurements(),
        coaching=COACHING,
    )
    assert isinstance(row_id, str)
    assert len(row_id) == 36


def test_insert_session_ids_are_unique(conn):
    ids = {
        db.insert_session(
            conn,
            exercise_type="free",
            exercise_spec=None,
            audio_path="/tmp/a.wav",
            measurements=_measurements(),
            coaching=None,
        )
        for _ in range(25)
    }
    assert len(ids) == 25


def test_insert_session_allows_null_spec_and_coaching(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/free.wav",
        measurements=_measurements(),
        coaching=None,
    )
    session = db.get_session(conn, row_id)
    assert session["exercise_spec"] is None
    assert session["coaching"] is None
    assert session["coaching_md"] == ""


def test_sessions_round_trip_models(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="scale",
        exercise_spec=SCALE_SPEC,
        audio_path="/tmp/test.wav",
        measurements=_measurements(),
        coaching=COACHING,
    )

    session = db.get_session(conn, row_id)

    assert session["exercise_type"] == "scale"
    assert session["exercise_spec"] == SCALE_SPEC
    assert session["measurements"] == _measurements()
    assert session["coaching"] == COACHING
    assert session["coaching_md"] == COACHING.to_markdown()


def test_update_coaching_replaces_md_and_json(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/free.wav",
        measurements=_measurements(),
        coaching=None,
    )
    db.update_coaching(conn, row_id, COACHING)

    session = db.get_session(conn, row_id)
    assert session["coaching"] == COACHING
    assert session["coaching_md"] == COACHING.to_markdown()


def test_recent_sessions_returns_most_recent_first_limited(conn):
    for i in range(7):
        db.insert_session(
            conn,
            exercise_type="scale",
            exercise_spec=None,
            audio_path=f"/tmp/{i}.wav",
            measurements=_measurements(f1_mean=float(i)),
            coaching=None,
        )

    sessions = db.recent_sessions(conn, limit=5)

    assert len(sessions) == 5
    assert [s["measurements"].f1_mean for s in sessions] == [6.0, 5.0, 4.0, 3.0, 2.0]


def test_all_sessions_returns_every_row_most_recent_first(conn):
    for i in range(12):
        db.insert_session(
            conn,
            exercise_type="scale",
            exercise_spec=None,
            audio_path=f"/tmp/{i}.wav",
            measurements=_measurements(f1_mean=float(i)),
            coaching=None,
        )

    sessions = db.all_sessions(conn)

    assert len(sessions) == 12
    assert [s["measurements"].f1_mean for s in sessions] == [float(i) for i in range(11, -1, -1)]


def test_session_count(conn):
    assert db.session_count(conn) == 0
    for i in range(3):
        db.insert_session(
            conn,
            exercise_type="free",
            exercise_spec=None,
            audio_path=f"/tmp/{i}.wav",
            measurements=_measurements(),
            coaching=None,
        )
    assert db.session_count(conn) == 3


def _insert(conn, user_id=None, audio_path="/tmp/x.wav"):
    return db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path=audio_path,
        measurements=_measurements(),
        coaching=None,
        user_id=user_id,
    )


def test_sessions_are_scoped_to_the_signed_in_account(conn):
    _insert(conn, user_id="user-a")
    _insert(conn, user_id="user-b")
    _insert(conn, user_id=None)

    assert db.session_count(conn, user_id="user-a") == 1
    assert db.session_count(conn, user_id="user-b") == 1
    assert db.session_count(conn, user_id=None) == 1


def test_calibration_is_scoped_to_the_signed_in_account(conn):
    db.insert_calibration(
        conn, range_low=40, range_high=60, tessitura_low=45, tessitura_high=55,
        user_id="user-a",
    )
    db.insert_calibration(
        conn, range_low=48, range_high=72, tessitura_low=55, tessitura_high=67,
        user_id="user-b",
    )

    assert db.latest_calibration(conn, user_id="user-a").range_high_midi == 60
    assert db.latest_calibration(conn, user_id="user-b").range_high_midi == 72
    assert db.latest_calibration(conn, user_id=None) is None


def test_new_rows_start_in_the_outbox(conn):
    session_id = _insert(conn, user_id="user-a")
    assert [row["id"] for row in db.unsynced(conn, "sessions", "user-a")] == [session_id]


def test_mark_synced_empties_the_outbox(conn):
    session_id = _insert(conn, user_id="user-a")
    db.mark_synced(conn, "sessions", [session_id])
    assert db.unsynced(conn, "sessions", "user-a") == []


def test_retried_coaching_returns_to_the_outbox(conn):
    session_id = _insert(conn, user_id="user-a")
    db.mark_synced(conn, "sessions", [session_id])
    db.update_coaching(conn, session_id, COACHING)

    assert [row["id"] for row in db.unsynced(conn, "sessions", "user-a")] == [session_id]


def test_mark_synced_rejects_an_unknown_table(conn):
    with pytest.raises(ValueError):
        db.mark_synced(conn, "sessions; DROP TABLE sessions", ["x"])


def test_claim_orphaned_rows_adopts_signed_out_work(conn):
    orphan = _insert(conn, user_id=None)
    db.insert_calibration(
        conn, range_low=40, range_high=60, tessitura_low=45, tessitura_high=55
    )
    owned = _insert(conn, user_id="user-a")
    db.mark_synced(conn, "sessions", [owned])

    claimed = db.claim_orphaned_rows(conn, "user-a")

    assert claimed == 2
    assert db.session_count(conn, user_id="user-a") == 2
    assert orphan in {row["id"] for row in db.unsynced(conn, "sessions", "user-a")}


def test_insert_remote_session_is_idempotent(conn):
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "user-a",
        "ts": "2026-07-01T10:00:00+00:00",
        "exercise_type": "free",
        "measurements_json": '{"jitter_local": 0.01}',
        "coaching_md": "",
    }
    db.insert_remote_session(conn, row)
    db.insert_remote_session(conn, row)

    assert db.session_count(conn, user_id="user-a") == 1


def test_pulled_sessions_are_not_queued_for_re_upload(conn):
    db.insert_remote_session(
        conn,
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "user_id": "user-a",
            "ts": "2026-07-01T10:00:00+00:00",
            "exercise_type": "free",
            "measurements_json": '{"jitter_local": 0.01}',
            "coaching_md": "",
        },
    )
    assert db.unsynced(conn, "sessions", "user-a") == []


def test_pulled_sessions_carry_no_local_audio_path(conn):
    db.insert_remote_session(
        conn,
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "user_id": "user-a",
            "ts": "2026-07-01T10:00:00+00:00",
            "exercise_type": "free",
            "measurements_json": '{"jitter_local": 0.01}',
            "coaching_md": "",
        },
    )
    assert db.all_sessions(conn, user_id="user-a")[0]["audio_path"] == ""
