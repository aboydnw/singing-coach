import matplotlib
import numpy as np

matplotlib.use("Agg")

from singing_coach import app
from singing_coach.models import Measurements, NoteAccuracy, PitchAccuracy


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
