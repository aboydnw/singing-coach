import pytest

from singing_coach import db


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


def test_insert_calibration_returns_row_id(conn):
    row_id = db.insert_calibration(
        conn,
        range_low=48,
        range_high=72,
        tessitura_low=55,
        tessitura_high=67,
    )
    assert isinstance(row_id, int)
    assert row_id > 0


def test_latest_calibration_returns_none_when_empty(conn):
    assert db.latest_calibration(conn) is None


def test_latest_calibration_returns_most_recent_row(conn):
    db.insert_calibration(conn, range_low=40, range_high=60, tessitura_low=45, tessitura_high=55)
    db.insert_calibration(conn, range_low=48, range_high=72, tessitura_low=55, tessitura_high=67)

    latest = db.latest_calibration(conn)

    assert latest["range_low_midi"] == 48
    assert latest["range_high_midi"] == 72
    assert latest["tessitura_low_midi"] == 55
    assert latest["tessitura_high_midi"] == 67
    assert "ts" in latest


def test_insert_session_returns_row_id(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="scale",
        exercise_spec={"type": "scale", "target_notes_midi": [60, 62, 64]},
        audio_path="/tmp/test.wav",
        measurements={"jitter_local": 0.01, "hnr_mean": 22.5},
        coaching_md="Nice work.",
    )
    assert isinstance(row_id, int)
    assert row_id > 0


def test_insert_session_allows_null_exercise_spec_for_free_sing(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/free.wav",
        measurements={"jitter_local": 0.02},
        coaching_md="Some feedback.",
    )
    assert row_id > 0


def test_recent_sessions_round_trips_json_fields(conn):
    db.insert_session(
        conn,
        exercise_type="scale",
        exercise_spec={"type": "scale", "target_notes_midi": [60, 62, 64]},
        audio_path="/tmp/test.wav",
        measurements={"jitter_local": 0.01, "hnr_mean": 22.5},
        coaching_md="Nice work.",
    )

    sessions = db.recent_sessions(conn)

    assert len(sessions) == 1
    s = sessions[0]
    assert s["exercise_type"] == "scale"
    assert s["exercise_spec"] == {"type": "scale", "target_notes_midi": [60, 62, 64]}
    assert s["audio_path"] == "/tmp/test.wav"
    assert s["measurements"] == {"jitter_local": 0.01, "hnr_mean": 22.5}
    assert s["coaching_md"] == "Nice work."


def test_recent_sessions_returns_most_recent_first_limited(conn):
    for i in range(7):
        db.insert_session(
            conn,
            exercise_type="scale",
            exercise_spec={"index": i},
            audio_path=f"/tmp/{i}.wav",
            measurements={"i": i},
            coaching_md=f"feedback {i}",
        )

    sessions = db.recent_sessions(conn, limit=5)

    assert len(sessions) == 5
    indexes = [s["exercise_spec"]["index"] for s in sessions]
    assert indexes == [6, 5, 4, 3, 2]


def test_all_sessions_returns_every_row_most_recent_first(conn):
    for i in range(12):
        db.insert_session(
            conn,
            exercise_type="scale",
            exercise_spec={"index": i},
            audio_path=f"/tmp/{i}.wav",
            measurements={"i": i},
            coaching_md=f"feedback {i}",
        )

    sessions = db.all_sessions(conn)

    assert len(sessions) == 12
    assert [s["exercise_spec"]["index"] for s in sessions] == list(range(11, -1, -1))


def test_recent_sessions_handles_null_exercise_spec(conn):
    db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/free.wav",
        measurements={"hnr_mean": 18.0},
        coaching_md="Open up the throat.",
    )

    sessions = db.recent_sessions(conn)

    assert sessions[0]["exercise_spec"] is None
