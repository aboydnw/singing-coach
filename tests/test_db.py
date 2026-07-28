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


def test_connect_migrates_pre_coaching_json_schema(tmp_path):
    db_path = tmp_path / "old.db"
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

    conn = db.connect(db_path)
    sessions = db.all_sessions(conn)
    assert len(sessions) == 1
    assert sessions[0]["coaching"] is None
    assert sessions[0]["measurements"].jitter_local == 0.01
    conn.close()


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

    assert latest.range_low_midi == 48
    assert latest.range_high_midi == 72
    assert latest.tessitura_low_midi == 55
    assert latest.tessitura_high_midi == 67


def test_insert_session_returns_row_id(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="scale",
        exercise_spec=SCALE_SPEC,
        audio_path="/tmp/test.wav",
        measurements=_measurements(),
        coaching=COACHING,
    )
    assert isinstance(row_id, int)
    assert row_id > 0


def test_insert_session_allows_null_spec_and_coaching(conn):
    row_id = db.insert_session(
        conn,
        exercise_type="free",
        exercise_spec=None,
        audio_path="/tmp/free.wav",
        measurements=_measurements(),
        coaching=None,
    )
    assert row_id > 0
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
