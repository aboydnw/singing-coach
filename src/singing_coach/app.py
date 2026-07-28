"""Gradio UI for singing-coach. Thin glue over session_service; no business logic."""

from datetime import datetime, timedelta
from pathlib import Path

import gradio as gr
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure

from singing_coach import (
    audio_io,
    auth,
    coach_ollama,
    config,
    exercises,
    pitch,
    session_service,
    tone_gen,
)
from singing_coach.models import Calibration, ExerciseSpec, Measurements

CREAM = "#FFF8EF"
PANEL = "#FFFDF6"
INK = "#3D2C29"
MUTED = "#8A7566"
CORAL = "#D64B2A"
TEAL = "#00917C"
GRID = "#EADFCE"
HEALTHY_GREEN = "#4C9A70"

matplotlib.rcParams.update(
    {
        "figure.facecolor": CREAM,
        "axes.facecolor": PANEL,
        "axes.edgecolor": GRID,
        "axes.labelcolor": INK,
        "text.color": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "font.size": 10,
    }
)

CORAL_RAMP = gr.themes.Color(
    c50="#FDF1EC", c100="#FADFD4", c200="#F5BFA9", c300="#EE9C7C",
    c400="#E37450", c500="#D64B2A", c600="#B93E20", c700="#973219",
    c800="#742713", c900="#521B0D", c950="#3A1309",
)
TEAL_RAMP = gr.themes.Color(
    c50="#E9F7F4", c100="#CDEEE7", c200="#9CDDD0", c300="#66C9B7",
    c400="#2FAD99", c500="#00917C", c600="#007A68", c700="#006254",
    c800="#004B40", c900="#00352D", c950="#00251F",
)
WARM_NEUTRAL = gr.themes.Color(
    c50="#FFFDF8", c100="#FFF8EF", c200="#F5EBDD", c300="#E8D9C5",
    c400="#C9B39C", c500="#A98F77", c600="#8A7566", c700="#6B594C",
    c800="#4E4038", c900="#3D2C29", c950="#2A1E1C",
)

THEME = gr.themes.Soft(
    primary_hue=CORAL_RAMP,
    secondary_hue=TEAL_RAMP,
    neutral_hue=WARM_NEUTRAL,
    font=[gr.themes.GoogleFont("Nunito"), "ui-sans-serif", "system-ui", "sans-serif"],
    font_mono=[gr.themes.GoogleFont("Fira Code"), "ui-monospace", "monospace"],
).set(
    body_background_fill="#FFF8EF",
    body_text_color="#3D2C29",
    block_background_fill="#FFFDF6",
    block_border_color="#EADFCE",
    block_shadow="0 2px 10px rgba(61, 44, 41, 0.06)",
    button_primary_background_fill="#D64B2A",
    button_primary_background_fill_hover="#B93E20",
    button_primary_text_color="#FFF8EF",
)

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');

.gradio-container h1, .gradio-container h2, .gradio-container h3 {
    font-family: 'Fraunces', Georgia, serif !important;
    color: #3D2C29;
}
.gradio-container h1 {
    font-size: 2.4rem !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em;
}
#app-header {
    background: linear-gradient(180deg, #FFFDF8 0%, #FFF8EF 100%);
    border-radius: 16px;
    padding: 22px 28px 16px 28px;
    border: 1px solid #EADFCE;
    border-left: 4px solid #D64B2A;
}
#app-header h1 { color: #2A1E1C; margin-bottom: 0; }
#app-header p { color: #6B594C; margin-top: 0.35rem; }
#exercise-card {
    background: #FFFDF8;
    border: 1px solid #EADFCE;
    border-left: 4px solid #00917C;
    border-radius: 12px;
    padding: 14px 20px;
}
button.selected { font-weight: 700 !important; }
.prose table { border-collapse: collapse; }
.prose table td, .prose table th { padding: 4px 12px; border-color: #EADFCE !important; }
footer { display: none !important; }
"""

HEADER_MD = """# 🎙️ singing-coach
Warm up, sing, get coached. Your voice never leaves this machine — only the numbers do."""


def _detect_median_midi(audio_path: Path) -> int | None:
    audio, sr = audio_io.load(audio_path)
    _, f0, confidence = pitch.predict(audio, sr)
    stable = pitch.stable_pitches(f0, confidence)
    if stable.size == 0:
        return None
    median_hz = float(np.median(stable))
    return int(round(pitch.hz_to_midi(median_hz)))


def _midi_label(midi: int | None) -> str:
    if midi is None:
        return "(no stable pitch detected — try again)"
    return f"{exercises.midi_to_name(midi)}  (MIDI {midi})"


def _saved_label(midi: int | None) -> str:
    if midi is None:
        return "(not recorded)"
    return f"{exercises.midi_to_name(midi)}  (MIDI {midi}) — saved"


def _calibration_summary(calibration: Calibration | None) -> str:
    if calibration is None:
        return (
            "### No calibration yet\n"
            "Record all four notes below and save — exercises are scaled to your range."
        )
    name = exercises.midi_to_name
    line = (
        f"### Your saved calibration\n"
        f"Range **{name(calibration.range_low_midi)}–{name(calibration.range_high_midi)}**"
    )
    if calibration.tessitura_low_midi is not None:
        line += (
            f" · comfortable **{name(calibration.tessitura_low_midi)}–"
            f"{name(calibration.tessitura_high_midi)}**"
        )
    return line + "\n\nExercises already use this. Re-record a note below only to change it."


def _load_calibration():
    """Hydrate the Calibrate tab from the stored calibration so it survives restarts."""
    calibration = session_service.latest_calibration()
    if calibration is None:
        notes = (None, None, None, None)
    else:
        notes = (
            calibration.tessitura_low_midi,
            calibration.tessitura_high_midi,
            calibration.range_low_midi,
            calibration.range_high_midi,
        )
    return (
        _calibration_summary(calibration),
        *notes,
        *(_saved_label(midi) for midi in notes),
    )


def _figure(**kwargs) -> Figure:
    """A standalone figure with an Agg canvas, outside pyplot's global registry.

    pyplot keeps every figure it creates alive until explicitly closed, which leaks
    one figure per analysis over a long session.
    """
    fig = Figure(**kwargs)
    FigureCanvasAgg(fig)
    return fig


def _pitch_chart(
    target_notes_midi: list[int] | None,
    detected_times: np.ndarray,
    detected_f0: np.ndarray,
    detected_confidence: np.ndarray,
):
    fig = _figure(figsize=(8, 4))
    ax = fig.subplots()
    stable_mask = (detected_confidence >= 0.5) & (detected_f0 > 0)
    if stable_mask.any():
        detected_midi = np.where(
            stable_mask,
            69.0 + 12.0 * np.log2(np.where(detected_f0 > 0, detected_f0, 1.0) / 440.0),
            np.nan,
        )
        ax.plot(detected_times, detected_midi, color=CORAL, linewidth=2.0)
    if target_notes_midi:
        for m in target_notes_midi:
            ax.axhline(m, color=MUTED, linestyle=":", linewidth=0.9, alpha=0.55)
            ax.annotate(
                exercises.midi_to_name(m),
                xy=(0, m),
                xytext=(4, 2),
                textcoords="offset points",
                fontsize=8,
                color=MUTED,
            )
    ax.set_xlabel("time (s)")
    ax.set_ylabel("pitch (MIDI)")
    ax.set_title("Your pitch, note by note")
    fig.tight_layout()
    return fig


PROGRESS_PANELS = [
    ("cents_off", "Pitch accuracy", "cents off (avg)", (0, 25)),
    ("jitter_local", "Pitch steadiness (jitter)", "fraction", (0, 0.01)),
    ("shimmer_local", "Volume steadiness (shimmer)", "fraction", (0, 0.05)),
    ("hnr_mean", "Tone clarity (HNR)", "dB", (20, None)),
    ("vibrato_rate_hz", "Vibrato rate", "Hz", (5.0, 6.5)),
    ("vibrato_extent_cents", "Vibrato depth", "cents", (50, 100)),
]


def _session_metric(session: dict, key: str) -> float | None:
    m: Measurements = session["measurements"]
    if key == "cents_off":
        return m.accuracy.mean_abs_cents_off if m.accuracy else None
    return getattr(m, key, None)


def _progress_chart(sessions: list[dict]):
    if not sessions:
        fig = _figure(figsize=(8, 4))
        ax = fig.subplots()
        ax.text(0.5, 0.5, "No sessions yet — go sing something!", ha="center", va="center")
        ax.set_axis_off()
        return fig

    chronological = list(reversed(sessions))
    dates = [datetime.fromisoformat(s["ts"]) for s in chronological]

    fig = _figure(figsize=(13, 6.5))
    axes = fig.subplots(2, 3)
    for ax, (key, title, ylabel, healthy) in zip(axes.flat, PROGRESS_PANELS, strict=True):
        ys = np.array(
            [_session_metric(s, key) for s in chronological], dtype=float
        )  # None -> nan so matplotlib draws a gap
        ax.set_title(title, fontsize=10)
        ax.set_ylabel(ylabel, fontsize=8)

        plotted = ys[~np.isnan(ys)]
        if plotted.size == 0:
            ax.text(
                0.5, 0.5, "not measured yet",
                ha="center", va="center", transform=ax.transAxes,
                fontsize=9, color=MUTED,
            )
            ax.set_xticks([])
            ax.set_yticks([])
            continue

        lo, hi = healthy
        if hi is None:
            hi = max(lo * 1.5, float(plotted.max()) * 1.1)
        ax.axhspan(lo, hi, color=HEALTHY_GREEN, alpha=0.12, linewidth=0)
        ax.plot(dates, ys, marker="o", markersize=5, color=CORAL, linewidth=2.0)
        if len(dates) == 1:
            ax.set_xlim(dates[0] - timedelta(days=1), dates[0] + timedelta(days=1))
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
        ax.tick_params(axis="x", labelsize=7)
    fig.suptitle("Shaded band = healthy zone", fontsize=9, color=MUTED)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return fig


def _status_dot(level: str) -> str:
    return {"good": "🟢", "watch": "🟡", "work": "🔴", "none": "–"}[level]


def _metrics_markdown(measurements: Measurements) -> str:
    m = measurements
    rows: list[tuple[str, str, str]] = []

    if m.accuracy and m.accuracy.mean_abs_cents_off is not None:
        cents = m.accuracy.mean_abs_cents_off
        level = "good" if cents <= 25 else "watch" if cents <= 50 else "work"
        word = "on pitch" if level == "good" else "close" if level == "watch" else "off pitch"
        rows.append(("Pitch accuracy", f"{cents:.0f} cents off avg — {word}", level))

    if m.jitter_local is not None:
        level = "good" if m.jitter_local <= 0.01 else "watch" if m.jitter_local <= 0.02 else "work"
        rows.append(("Pitch steadiness (jitter)", f"{m.jitter_local:.4f}", level))
    if m.shimmer_local is not None:
        level = "good" if m.shimmer_local <= 0.05 else "watch" if m.shimmer_local <= 0.10 else "work"
        rows.append(("Volume steadiness (shimmer)", f"{m.shimmer_local:.4f}", level))
    if m.hnr_mean is not None:
        level = "good" if m.hnr_mean >= 20 else "watch" if m.hnr_mean >= 15 else "work"
        note = "clear" if level == "good" else "slightly breathy" if level == "watch" else "breathy"
        rows.append(("Tone clarity (HNR)", f"{m.hnr_mean:.1f} dB — {note}", level))

    minimal_vibrato = (m.vibrato_extent_cents or 0) < 20
    if m.vibrato_rate_hz is not None:
        if minimal_vibrato:
            rows.append(("Vibrato", "minimal / straight tone", "none"))
        else:
            r = m.vibrato_rate_hz
            level = "good" if 5.0 <= r <= 6.5 else "watch" if 4.0 <= r <= 7.0 else "work"
            rows.append(("Vibrato rate", f"{r:.1f} Hz", level))
            e = m.vibrato_extent_cents
            level = "good" if 50 <= e <= 100 else "watch" if 20 <= e <= 120 else "work"
            rows.append(("Vibrato depth", f"{e:.0f} cents", level))

    if m.f1_mean is not None and m.f2_mean is not None:
        rows.append(("Vowel placement (F1/F2)", f"{m.f1_mean:.0f} / {m.f2_mean:.0f} Hz", "none"))

    lines = ["| how you did | value | |", "|---|---|---|"]
    lines += [f"| {label} | {value} | {_status_dot(level)} |" for label, value, level in rows]

    if m.accuracy and any(n.cents_off is not None for n in m.accuracy.per_note):
        lines += ["", "| target note | cents off | |", "|---|---|---|"]
        for n in m.accuracy.per_note:
            if n.cents_off is None:
                lines.append(f"| {n.target_name} | (not detected) | – |")
                continue
            verdict = "✓" if abs(n.cents_off) <= 25 else ("♭ flat" if n.cents_off < 0 else "♯ sharp")
            lines.append(f"| {n.target_name} | {n.cents_off:+.0f} | {verdict} |")

    return "\n".join(lines)


ANALYZING_MESSAGE = (
    "⏳ **Analyzing your recording…** Measuring pitch, then asking the coach for feedback. "
    "This usually takes 10–30 seconds. The very first analysis also downloads the pitch "
    "model (~2 GB), which can take several minutes — it only happens once."
)


def _analysis_outputs(result: session_service.AnalysisResult, spec: ExerciseSpec | None):
    """UI updates for a completed analysis: status, chart, scorecard, coaching, playback."""
    fig = _pitch_chart(
        spec.target_notes_midi if spec else None,
        result.times,
        result.f0,
        result.confidence,
    )
    metrics = _metrics_markdown(result.measurements)
    plot_update = gr.update(value=fig, visible=True)
    playback_update = gr.update(
        value=str(result.saved_path),
        visible=session_service.audio_available(result.saved_path),
    )
    if result.coaching_error:
        return (
            "⚠️ **Measurements saved, but the coaching call failed.** "
            "Your scores are below — use *Retry coaching* to try again.",
            plot_update,
            metrics,
            "",
            f"⚠️ Coaching failed: {result.coaching_error}",
            gr.update(visible=True),
            result.session_id,
            playback_update,
        )
    return (
        "✅ **Analysis complete.** Your results are below.",
        plot_update,
        metrics,
        result.coaching.to_markdown(),
        "",
        gr.update(visible=False),
        result.session_id,
        playback_update,
    )


def _empty_outputs(status: str):
    """UI updates for an analysis that never produced results, with the reason why."""
    return (
        status,
        gr.update(visible=False),
        "",
        "",
        "",
        gr.update(visible=False),
        None,
        gr.update(visible=False),
    )


def _run_analysis(audio_path: str | None, spec: ExerciseSpec | None):
    """Analyze one recording, reporting any failure in the UI rather than raising."""
    if not audio_path:
        return _empty_outputs("⚠️ **Nothing to analyze yet** — record your attempt first.")
    try:
        result = session_service.analyze_session(audio_path, spec)
    except Exception as exc:
        return _empty_outputs(f"❌ **Analysis failed:** {exc}")
    return _analysis_outputs(result, spec)


def _save_calibration(low_comf, high_comf, low_edge, high_edge):
    """Validate and persist a calibration, then refresh everything derived from it.

    A rejected save leaves every other output untouched, so failing validation does
    not cost the user the takes they just recorded.
    """
    unchanged = (gr.skip(),) * 11
    if None in (low_comf, high_comf, low_edge, high_edge):
        return ("Need all four notes detected before saving.", *unchanged)
    if not (low_edge <= low_comf <= high_comf <= high_edge):
        return (
            "Expected: low edge ≤ low comfortable ≤ high comfortable ≤ high edge.",
            *unchanged,
        )

    session_service.save_calibration(low_comf, high_comf, low_edge, high_edge)
    name = exercises.midi_to_name
    status = (
        f"Saved. Range: {name(low_edge)}–{name(high_edge)}; "
        f"tessitura: {name(low_comf)}–{name(high_comf)}."
    )
    return (status, *_load_calibration(), *_load_exercise())


def _load_exercise():
    """The next exercise and its description, ready to sing without a button press."""
    spec = session_service.next_exercise()
    if spec is None:
        return None, (
            "### No exercise yet\n"
            "Head to the **Calibrate** tab first — exercises are built around your range."
        )
    notes_str = ", ".join(exercises.midi_to_name(m) for m in spec.target_notes_midi)
    md = (
        f"### Today's exercise: {spec.display_name}\n"
        f"**Notes:** {notes_str} · **Vowel:** {spec.vowel} · "
        f"**{spec.duration_per_note_s:.0f}s per note**"
    )
    return spec, md


def _next_exercise():
    """Load a fresh exercise and clear the previous attempt's recording and results."""
    spec, md = _load_exercise()
    cleared_audio = gr.update(value=None, visible=False)
    return (
        spec,
        md,
        "",
        cleared_audio,
        None,
        cleared_audio,
        gr.update(visible=False),
        "",
        "",
        "",
        gr.update(visible=False),
        gr.update(visible=False),
        None,
    )


def _on_retry(session_id):
    if not session_id:
        return "", "No saved session to retry."
    coaching, error = session_service.retry_coaching(session_id)
    if error:
        return "", f"⚠️ {error}"
    return coaching.to_markdown(), ""


NO_AUDIO_NOTE = "— recorded on another device"


def _account_status() -> str:
    """Where sync stands: unconfigured, signed out, or signed in and backing up."""
    if not auth.is_configured():
        return (
            "### Backup is off\n"
            "No Supabase project configured, so history lives only on this machine. "
            f"Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `{config.USER_CONFIG_FILE}` "
            "to turn on backup and multi-device sync."
        )
    user = auth.current_user()
    if user is None:
        return (
            "### Signed out\n"
            "Your singing is still saved locally — it just isn't backed up. "
            "Sign in to back it up and pull in history from your other devices."
        )
    return f"### Signed in as {user['email']}\nEvery session is backed up as you go."


def _backend_status() -> str:
    """Which model is doing the coaching, and whether it can actually be reached."""
    if config.uses_anthropic():
        return f"Coaching via the Anthropic API (`{config.coach_model()}`) — billed per session."
    ready, message = coach_ollama.availability()
    return ("🟢 " if ready else "⚠️ ") + message


def _session_rows(sessions: list[dict]) -> str:
    if not sessions:
        return "No sessions yet."
    lines = ["| when | exercise | focus | audio |", "|---|---|---|---|"]
    for session in sessions[:20]:
        when = session["ts"][:16].replace("T", " ")
        coaching = session.get("coaching")
        focus = coaching.focus_area.value.replace("_", " ") if coaching else "—"
        has_audio = session_service.audio_available(session.get("audio_path"))
        lines.append(
            f"| {when} | {session['exercise_type']} | {focus} | "
            f"{'▶ on this device' if has_audio else NO_AUDIO_NOTE} |"
        )
    return "\n".join(lines)


def _playable_choices(sessions: list[dict]) -> list[tuple[str, str]]:
    return [
        (f"{s['ts'][:16].replace('T', ' ')} · {s['exercise_type']}", s["id"])
        for s in sessions
        if session_service.audio_available(s.get("audio_path"))
    ]


def _play_session(session_id, sessions_by_id: dict):
    if not session_id:
        return gr.update(visible=False)
    path = sessions_by_id.get(session_id)
    if not session_service.audio_available(path):
        return gr.update(visible=False)
    return gr.update(value=path, visible=True)


def _refresh_progress(filter_choice: str):
    sessions = session_service.all_sessions()
    if filter_choice == "Exercises only":
        sessions = [s for s in sessions if s["exercise_type"] != "free"]
    elif filter_choice == "Free-sing only":
        sessions = [s for s in sessions if s["exercise_type"] == "free"]
    fig = _progress_chart(sessions)
    noun = "session" if len(sessions) == 1 else "sessions"
    paths = {s["id"]: s.get("audio_path") for s in sessions}
    return (
        fig,
        f"**{len(sessions)} {noun} logged.**",
        _session_rows(sessions),
        gr.update(choices=_playable_choices(sessions), value=None),
        paths,
        gr.update(visible=False),
    )


def _build_ui() -> gr.Blocks:
    if not config.uses_anthropic():
        has_key = True  # local coaching needs no API key, so skip first-run setup
    else:
        try:
            config.load_api_key()
            has_key = True
        except config.MissingApiKeyError:
            has_key = False

    with gr.Blocks(title="singing-coach") as app:
        gr.Markdown(HEADER_MD, elem_id="app-header")

        with gr.Column(visible=not has_key) as setup_col:
            gr.Markdown(
                "## First-run setup\n"
                "Paste your Anthropic API key. It will be saved to "
                f"`{config.USER_CONFIG_FILE}` with mode 0600 and used for coaching.\n\n"
                "ℹ️ The first analysis also downloads the pitch model (~2 GB, one time)."
            )
            key_input = gr.Textbox(label="ANTHROPIC_API_KEY", type="password")
            setup_status = gr.Markdown()
            save_key_btn = gr.Button("Save and continue", variant="primary")

        with gr.Column(visible=has_key) as main_col:
            with gr.Tabs():
                with gr.Tab("Calibrate"):
                    calibration_summary = gr.Markdown()
                    gr.Markdown(
                        "Sing each note for ~3 seconds. The app detects the median pitch. "
                        "Your calibration is saved, so you only need to redo the notes you "
                        "want to change."
                    )

                    with gr.Row():
                        with gr.Column():
                            gr.Markdown("**Lowest comfortable**")
                            low_comf_audio = gr.Audio(sources=["microphone"], type="filepath")
                            low_comf_midi = gr.State(value=None)
                            low_comf_label = gr.Markdown("(not recorded)")
                        with gr.Column():
                            gr.Markdown("**Highest comfortable**")
                            high_comf_audio = gr.Audio(sources=["microphone"], type="filepath")
                            high_comf_midi = gr.State(value=None)
                            high_comf_label = gr.Markdown("(not recorded)")
                    with gr.Row():
                        with gr.Column():
                            gr.Markdown("**Lowest edge** (vocal floor)")
                            low_edge_audio = gr.Audio(sources=["microphone"], type="filepath")
                            low_edge_midi = gr.State(value=None)
                            low_edge_label = gr.Markdown("(not recorded)")
                        with gr.Column():
                            gr.Markdown("**Highest edge** (vocal ceiling)")
                            high_edge_audio = gr.Audio(sources=["microphone"], type="filepath")
                            high_edge_midi = gr.State(value=None)
                            high_edge_label = gr.Markdown("(not recorded)")

                    save_calibration_btn = gr.Button("Save calibration", variant="primary")
                    calibration_status = gr.Markdown()

                    def _on_clip(path):
                        if not path:
                            return None, "(cleared)"
                        midi = _detect_median_midi(Path(path))
                        return midi, _midi_label(midi)

                    for audio_comp, midi_state, label in (
                        (low_comf_audio, low_comf_midi, low_comf_label),
                        (high_comf_audio, high_comf_midi, high_comf_label),
                        (low_edge_audio, low_edge_midi, low_edge_label),
                        (high_edge_audio, high_edge_midi, high_edge_label),
                    ):
                        audio_comp.change(_on_clip, inputs=audio_comp, outputs=[midi_state, label])

                with gr.Tab("Exercise"):
                    exercise_state = gr.State(value=None)

                    exercise_display = gr.Markdown(elem_id="exercise-card")

                    gr.Markdown(
                        "#### Step 1 — Hear it\n"
                        "Target notes are just labels until you hear them. Play the reference "
                        "tones and hum along until the shape is in your ear."
                    )
                    play_btn = gr.Button("▶  Play reference tones", variant="primary")
                    reference_audio = gr.Audio(
                        label="Reference tones", autoplay=True, visible=False
                    )

                    gr.Markdown(
                        "#### Step 2 — Sing it\n"
                        "Record yourself singing those notes on the vowel above."
                    )
                    record_audio = gr.Audio(
                        sources=["microphone"], type="filepath", label="Record your attempt"
                    )

                    gr.Markdown("#### Step 3 — Get coached")
                    analyze_btn = gr.Button("Analyze my attempt", variant="primary")
                    analyze_status = gr.Markdown()

                    attempt_playback = gr.Audio(
                        label="Your attempt (listen back)", visible=False
                    )
                    pitch_plot = gr.Plot(label="Pitch contour", visible=False)
                    metrics_md = gr.Markdown()
                    coaching_md = gr.Markdown()
                    error_md = gr.Markdown()
                    retry_btn = gr.Button("Retry coaching", visible=False)
                    next_btn = gr.Button("Next exercise  →", visible=False)
                    last_session = gr.State(value=None)

                    def _play_reference(spec):
                        if spec is None:
                            return gr.update(visible=False)
                        audio, sr = tone_gen.sequence(
                            spec.target_notes_midi, spec.duration_per_note_s
                        )
                        return gr.update(value=(sr, audio), visible=True)

                    play_btn.click(_play_reference, inputs=exercise_state, outputs=reference_audio)

                    analyze_outputs = [
                        analyze_status,
                        pitch_plot,
                        metrics_md,
                        coaching_md,
                        error_md,
                        retry_btn,
                        last_session,
                        attempt_playback,
                    ]

                    analyze_btn.click(
                        lambda: ANALYZING_MESSAGE, outputs=analyze_status
                    ).then(
                        _run_analysis,
                        inputs=[record_audio, exercise_state],
                        outputs=analyze_outputs,
                    ).then(
                        lambda session_id: gr.update(visible=session_id is not None),
                        inputs=last_session,
                        outputs=next_btn,
                    )

                    retry_btn.click(_on_retry, inputs=last_session, outputs=[coaching_md, error_md])

                    next_btn.click(
                        _next_exercise,
                        outputs=[
                            exercise_state,
                            exercise_display,
                            analyze_status,
                            reference_audio,
                            record_audio,
                            attempt_playback,
                            pitch_plot,
                            metrics_md,
                            coaching_md,
                            error_md,
                            retry_btn,
                            next_btn,
                            last_session,
                        ],
                    )

                with gr.Tab("Free-sing"):
                    free_audio = gr.Audio(
                        sources=["microphone"], type="filepath", label="Record a passage"
                    )
                    free_analyze = gr.Button("Analyze my recording", variant="primary")
                    free_status = gr.Markdown()
                    free_playback = gr.Audio(
                        label="Your attempt (listen back)", visible=False
                    )
                    free_pitch = gr.Plot(label="Pitch contour", visible=False)
                    free_metrics = gr.Markdown()
                    free_coaching = gr.Markdown()
                    free_error = gr.Markdown()
                    free_retry = gr.Button("Retry coaching", visible=False)
                    free_last_session = gr.State(value=None)

                    free_analyze.click(
                        lambda: ANALYZING_MESSAGE, outputs=free_status
                    ).then(
                        lambda audio_path: _run_analysis(audio_path, None),
                        inputs=free_audio,
                        outputs=[
                            free_status,
                            free_pitch,
                            free_metrics,
                            free_coaching,
                            free_error,
                            free_retry,
                            free_last_session,
                            free_playback,
                        ],
                    )

                    free_retry.click(
                        _on_retry, inputs=free_last_session, outputs=[free_coaching, free_error]
                    )

                with gr.Tab("Progress") as progress_tab:
                    with gr.Row():
                        progress_filter = gr.Dropdown(
                            choices=["All sessions", "Exercises only", "Free-sing only"],
                            value="All sessions",
                            label="Show",
                        )
                        refresh_btn = gr.Button("Refresh")
                    progress_plot = gr.Plot(label="Trends over time")
                    session_count = gr.Markdown()

                    gr.Markdown("#### Session history")
                    session_table = gr.Markdown()
                    session_paths = gr.State(value={})
                    with gr.Row():
                        session_picker = gr.Dropdown(
                            choices=[], label="Listen back to a session", value=None
                        )
                    session_audio = gr.Audio(label="Recording", visible=False)

                    progress_outputs = [
                        progress_plot,
                        session_count,
                        session_table,
                        session_picker,
                        session_paths,
                        session_audio,
                    ]

                    refresh_btn.click(
                        _refresh_progress, inputs=progress_filter, outputs=progress_outputs
                    )
                    progress_filter.change(
                        _refresh_progress, inputs=progress_filter, outputs=progress_outputs
                    )
                    progress_tab.select(
                        _refresh_progress, inputs=progress_filter, outputs=progress_outputs
                    )
                    session_picker.change(
                        _play_session,
                        inputs=[session_picker, session_paths],
                        outputs=session_audio,
                    )

                with gr.Tab("Account") as account_tab:
                    account_status = gr.Markdown()
                    backend_status = gr.Markdown()

                    with gr.Row():
                        email_input = gr.Textbox(label="Email")
                        password_input = gr.Textbox(label="Password", type="password")
                    with gr.Row():
                        sign_in_btn = gr.Button("Sign in", variant="primary")
                        sign_up_btn = gr.Button("Create account")
                        sign_out_btn = gr.Button("Sign out")
                    with gr.Row():
                        sync_btn = gr.Button("Sync now")
                    account_message = gr.Markdown()

                    def _refresh_account():
                        return _account_status(), _backend_status()

                    def _on_sign_in(email, password):
                        _user, message = session_service.sign_in(email or "", password or "")
                        return message, _account_status(), ""

                    def _on_sign_up(email, password):
                        _user, message = session_service.sign_up(email or "", password or "")
                        return message, _account_status(), ""

                    def _on_sign_out():
                        auth.sign_out()
                        return (
                            "Signed out. Your local history is untouched.",
                            _account_status(),
                            "",
                        )

                    def _on_sync():
                        return session_service.sync_now().summary(), _account_status()

                    # The password box is cleared on every outcome, including failures:
                    # a wrong password should not sit in the DOM waiting to be resubmitted.
                    sign_in_btn.click(
                        _on_sign_in,
                        inputs=[email_input, password_input],
                        outputs=[account_message, account_status, password_input],
                    )
                    sign_up_btn.click(
                        _on_sign_up,
                        inputs=[email_input, password_input],
                        outputs=[account_message, account_status, password_input],
                    )
                    sign_out_btn.click(
                        _on_sign_out,
                        outputs=[account_message, account_status, password_input],
                    )
                    sync_btn.click(_on_sync, outputs=[account_message, account_status])
                    account_tab.select(
                        _refresh_account, outputs=[account_status, backend_status]
                    )

        def _save_key(key):
            key = (key or "").strip()
            if not key:
                return gr.update(), gr.update(), "Key cannot be empty."
            config.save_api_key(key)
            return (
                gr.update(visible=False),
                gr.update(visible=True),
                "",
            )

        save_key_btn.click(
            _save_key,
            inputs=key_input,
            outputs=[setup_col, main_col, setup_status],
        )

        calibration_outputs = [
            calibration_summary,
            low_comf_midi, high_comf_midi, low_edge_midi, high_edge_midi,
            low_comf_label, high_comf_label, low_edge_label, high_edge_label,
        ]
        exercise_outputs = [exercise_state, exercise_display]

        # Wired here rather than in the Calibrate tab because saving a calibration
        # also refreshes the Exercise tab, which is defined further down.
        save_calibration_btn.click(
            _save_calibration,
            inputs=[low_comf_midi, high_comf_midi, low_edge_midi, high_edge_midi],
            outputs=[calibration_status, *calibration_outputs, *exercise_outputs],
        )

        app.load(_load_calibration, outputs=calibration_outputs)
        app.load(_load_exercise, outputs=exercise_outputs)
        app.load(_refresh_account, outputs=[account_status, backend_status])

    return app


def main() -> None:
    session_service.ensure_dirs()
    session_service.restore_session()
    _build_ui().launch(
        inbrowser=True,
        theme=THEME,
        css=CSS,
        allowed_paths=[str(session_service.RECORDINGS_DIR)],
    )


if __name__ == "__main__":
    main()
