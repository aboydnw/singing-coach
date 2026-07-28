import matplotlib
import numpy as np

matplotlib.use("Agg")

from pathlib import Path

import gradio as gr

from singing_coach import app, session_service
from singing_coach.models import (
    Calibration,
    ExerciseSpec,
    Measurements,
    NoteAccuracy,
    PitchAccuracy,
)


def _session(ts: str, measurements: Measurements, exercise_type: str = "scale") -> dict:
    return {"ts": ts, "exercise_type": exercise_type, "measurements": measurements}


def _accuracy(cents: float) -> PitchAccuracy:
    return PitchAccuracy(
        per_note=[NoteAccuracy(target_midi=60, target_name="C4", cents_off=cents)],
        mean_abs_cents_off=abs(cents),
    )


def test_progress_chart_renders_with_no_sessions():
    fig = app._progress_chart([])
    fig.canvas.draw()
    assert fig is not None


def test_progress_chart_renders_with_a_single_session():
    sessions = [_session("2026-07-01T10:00:00+00:00", Measurements(jitter_local=0.01))]
    fig = app._progress_chart(sessions)
    fig.canvas.draw()
    assert fig is not None


def test_progress_chart_keeps_gaps_for_sessions_missing_a_metric():
    sessions = [
        _session("2026-07-03T10:00:00+00:00", Measurements(jitter_local=0.01)),
        _session(
            "2026-07-02T10:00:00+00:00",
            Measurements(jitter_local=0.02, accuracy=_accuracy(-30.0)),
        ),
        _session("2026-07-01T10:00:00+00:00", Measurements(jitter_local=0.03)),
    ]
    fig = app._progress_chart(sessions)
    fig.canvas.draw()

    accuracy_axis = fig.axes[0]
    ydata = accuracy_axis.lines[0].get_ydata()
    assert np.isnan(ydata[0])
    assert ydata[1] == 30.0
    assert np.isnan(ydata[2])


def test_metrics_markdown_handles_empty_measurements():
    md = app._metrics_markdown(Measurements())
    assert "how you did" in md


def test_metrics_markdown_omits_formants_when_f2_missing():
    md = app._metrics_markdown(Measurements(f1_mean=700.0))
    assert "Vowel placement" not in md


def test_metrics_markdown_flags_off_pitch_notes():
    md = app._metrics_markdown(Measurements(accuracy=_accuracy(-70.0)))
    assert "off pitch" in md
    assert "flat" in md


def test_metrics_markdown_reports_straight_tone_as_minimal_vibrato():
    md = app._metrics_markdown(
        Measurements(vibrato_rate_hz=0.0, vibrato_extent_cents=0.0)
    )
    assert "minimal" in md


def test_launch_allows_serving_recordings_from_the_data_dir(monkeypatch):
    captured = {}

    class FakeApp:
        def launch(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(app, "_build_ui", lambda: FakeApp())
    monkeypatch.setattr(app.session_service, "ensure_dirs", lambda: None)
    app.main()

    assert str(session_service.RECORDINGS_DIR) in captured["allowed_paths"]


def test_calibration_summary_prompts_when_never_calibrated():
    assert "No calibration yet" in app._calibration_summary(None)


def test_calibration_summary_shows_saved_range_and_tessitura():
    summary = app._calibration_summary(
        Calibration(
            range_low_midi=48,
            range_high_midi=64,
            tessitura_low_midi=51,
            tessitura_high_midi=58,
        )
    )
    assert "C3" in summary
    assert "E4" in summary
    assert "D#3" in summary


def test_load_calibration_prefills_the_four_notes_from_storage(monkeypatch):
    monkeypatch.setattr(
        app.session_service,
        "latest_calibration",
        lambda: Calibration(
            range_low_midi=48,
            range_high_midi=64,
            tessitura_low_midi=51,
            tessitura_high_midi=58,
        ),
    )
    _summary, low_comf, high_comf, low_edge, high_edge, *labels = app._load_calibration()

    assert (low_comf, high_comf, low_edge, high_edge) == (51, 58, 48, 64)
    assert all("saved" in label for label in labels)


def test_load_calibration_leaves_notes_empty_when_never_calibrated(monkeypatch):
    monkeypatch.setattr(app.session_service, "latest_calibration", lambda: None)
    _summary, *notes_and_labels = app._load_calibration()

    assert notes_and_labels[:4] == [None, None, None, None]


def test_save_calibration_keeps_recorded_notes_when_validation_fails(monkeypatch):
    def fail(*args):
        raise AssertionError("must not persist an invalid calibration")

    monkeypatch.setattr(app.session_service, "save_calibration", fail)
    status, *rest = app._save_calibration(51, 58, 64, 48)

    assert "Expected" in status
    assert rest == [gr.skip()] * 11


def test_save_calibration_keeps_recorded_notes_when_a_note_is_missing(monkeypatch):
    def fail(*args):
        raise AssertionError("must not persist an incomplete calibration")

    monkeypatch.setattr(app.session_service, "save_calibration", fail)
    status, *rest = app._save_calibration(51, None, 48, 64)

    assert "four notes" in status
    assert rest == [gr.skip()] * 11


def test_save_calibration_makes_the_exercise_available_immediately(monkeypatch):
    saved = []
    monkeypatch.setattr(
        app.session_service, "save_calibration", lambda *args: saved.append(args)
    )
    monkeypatch.setattr(
        app.session_service,
        "latest_calibration",
        lambda: Calibration(
            range_low_midi=48,
            range_high_midi=64,
            tessitura_low_midi=51,
            tessitura_high_midi=58,
        ),
    )
    monkeypatch.setattr(
        app.session_service,
        "next_exercise",
        lambda: ExerciseSpec(
            type="sustained",
            target_notes_midi=[52],
            duration_per_note_s=3.0,
            vowel="ah",
            display_name="sustained on 'ah'",
        ),
    )
    status, *rest = app._save_calibration(51, 58, 48, 64)
    exercise_spec, exercise_md = rest[-2], rest[-1]

    assert saved == [(51, 58, 48, 64)]
    assert "Saved" in status
    assert exercise_spec is not None
    assert "Calibrate" not in exercise_md


def test_load_exercise_points_at_calibration_when_there_is_none(monkeypatch):
    monkeypatch.setattr(app.session_service, "next_exercise", lambda: None)
    spec, md = app._load_exercise()

    assert spec is None
    assert "Calibrate" in md


def test_load_exercise_describes_the_notes_to_sing(monkeypatch):
    monkeypatch.setattr(
        app.session_service,
        "next_exercise",
        lambda: ExerciseSpec(
            type="scale",
            target_notes_midi=[60, 62, 64],
            duration_per_note_s=2.0,
            vowel="ah",
            display_name="5-note scale",
        ),
    )
    spec, md = app._load_exercise()

    assert spec is not None
    assert "C4" in md
    assert "ah" in md


def test_next_exercise_clears_the_previous_session_id(monkeypatch):
    monkeypatch.setattr(app.session_service, "next_exercise", lambda: None)
    outputs = app._next_exercise()

    assert outputs[-1] is None


def test_run_analysis_explains_that_nothing_was_recorded():
    status, *rest = app._run_analysis(None, None)

    assert "record" in status.lower()
    assert rest[5] is None


def test_run_analysis_reports_a_pipeline_failure_instead_of_raising(monkeypatch):
    def boom(audio_path, spec):
        raise RuntimeError("pitch model unavailable")

    monkeypatch.setattr(app.session_service, "analyze_session", boom)
    status, *rest = app._run_analysis("/tmp/attempt.wav", None)

    assert "failed" in status.lower()
    assert rest[5] is None


def test_run_analysis_reports_success_and_the_saved_session(monkeypatch):
    monkeypatch.setattr(
        app.session_service,
        "analyze_session",
        lambda audio_path, spec: _analysis_result(coaching_error=None),
    )
    status, *rest = app._run_analysis("/tmp/attempt.wav", None)

    assert "complete" in status.lower()
    assert rest[5] == 7


def test_analysis_outputs_keep_measurements_when_coaching_fails():
    status, plot, metrics, coaching, error, retry, session_id, _playback = (
        app._analysis_outputs(_analysis_result(coaching_error="429 rate limited"), None)
    )

    assert "coaching" in status.lower()
    assert plot["visible"] is True
    assert "how you did" in metrics
    assert coaching == ""
    assert "429 rate limited" in error
    assert retry["visible"] is True
    assert session_id == 7


def _analysis_result(coaching_error: str | None) -> session_service.AnalysisResult:
    from singing_coach.models import CoachingResult, FocusArea

    coaching = (
        None
        if coaching_error
        else CoachingResult(
            focus_area=FocusArea.pitch_accuracy,
            top_issue="Flat on the top note",
            why="You ran out of breath.",
            drill="Sirens.",
            encouragement="Good work.",
        )
    )
    return session_service.AnalysisResult(
        session_id=7,
        saved_path=Path("/tmp/attempt.wav"),
        measurements=Measurements(hnr_mean=22.0),
        times=np.array([0.0, 0.01]),
        f0=np.array([220.0, 220.0]),
        confidence=np.array([0.9, 0.9]),
        coaching=coaching,
        coaching_error=coaching_error,
    )
