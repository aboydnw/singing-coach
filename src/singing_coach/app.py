"""Gradio UI for singing-coach. Thin glue over the analysis and service modules."""

import json
import shutil
import uuid
from datetime import date
from pathlib import Path

import gradio as gr
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from singing_coach import (
    audio_io,
    coach,
    config,
    db,
    exercises,
    pitch,
    tone_gen,
    voice_qa,
)

DATA_DIR = Path.home() / ".singing-coach"
DB_PATH = DATA_DIR / "sessions.db"
RECORDINGS_DIR = DATA_DIR / "recordings"


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


def _save_recording(src_path: str) -> Path:
    day_dir = RECORDINGS_DIR / date.today().isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    dest = day_dir / f"{uuid.uuid4()}.wav"
    shutil.copy(src_path, dest)
    return dest


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


def _pitch_chart(
    target_notes_midi: list[int] | None,
    detected_times: np.ndarray,
    detected_f0: np.ndarray,
    detected_confidence: np.ndarray,
):
    fig, ax = plt.subplots(figsize=(8, 4))
    stable_mask = (detected_confidence >= 0.5) & (detected_f0 > 0)
    if stable_mask.any():
        detected_midi = np.where(
            stable_mask,
            69.0 + 12.0 * np.log2(np.where(detected_f0 > 0, detected_f0, 1.0) / 440.0),
            np.nan,
        )
        ax.plot(detected_times, detected_midi, label="detected", linewidth=1.5)
    if target_notes_midi:
        for i, m in enumerate(target_notes_midi):
            ax.axhline(m, color="gray", linestyle=":", linewidth=0.8, alpha=0.6)
            ax.annotate(
                exercises.midi_to_name(m),
                xy=(0, m),
                xytext=(4, 2),
                textcoords="offset points",
                fontsize=8,
                color="gray",
            )
    ax.set_xlabel("time (s)")
    ax.set_ylabel("pitch (MIDI)")
    ax.set_title("Pitch contour")
    ax.legend(loc="upper right")
    fig.tight_layout()
    return fig


def _progress_chart(sessions: list[dict]):
    if not sessions:
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, "No sessions yet", ha="center", va="center")
        ax.set_axis_off()
        return fig

    chronological = list(reversed(sessions))
    x = list(range(1, len(chronological) + 1))

    def _series(key):
        return [s["measurements"].get(key) for s in chronological]

    fig, axes = plt.subplots(2, 2, figsize=(10, 6))
    for ax, (key, title, ylabel) in zip(
        axes.flat,
        [
            ("jitter_local", "Jitter (local)", "fraction"),
            ("hnr_mean", "HNR mean", "dB"),
            ("vibrato_rate_hz", "Vibrato rate", "Hz"),
            ("vibrato_extent_cents", "Vibrato extent", "cents"),
        ],
    ):
        ys = _series(key)
        ax.plot(x, ys, marker="o")
        ax.set_title(title)
        ax.set_xlabel("session #")
        ax.set_ylabel(ylabel)
    fig.tight_layout()
    return fig


def _metrics_markdown(measurements: dict) -> str:
    lines = ["| metric | value |", "|---|---|"]
    for key in (
        "jitter_local",
        "shimmer_local",
        "hnr_mean",
        "vibrato_rate_hz",
        "vibrato_extent_cents",
        "f1_mean",
        "f2_mean",
    ):
        v = measurements.get(key)
        if v is None:
            continue
        lines.append(f"| {key} | {v:.3f} |")
    return "\n".join(lines)


def _analyze(audio_filepath: str, exercise_spec: dict | None):
    """Returns (saved_audio_path, measurements, pitch_arrays, coaching_md_or_error)."""
    saved = _save_recording(audio_filepath)
    audio, sr = audio_io.load(saved)
    times, f0, confidence = pitch.predict(audio, sr)
    measurements = voice_qa.analyze(saved)

    conn = db.connect(DB_PATH)
    try:
        history = db.recent_sessions(conn, limit=5)
        try:
            coaching_md = coach.coach(exercise_spec, measurements, history)
            coaching_error = None
        except Exception as exc:
            coaching_md = ""
            coaching_error = str(exc)

        db.insert_session(
            conn,
            exercise_type=exercise_spec["type"] if exercise_spec else "free",
            exercise_spec=exercise_spec,
            audio_path=str(saved),
            measurements=measurements,
            coaching_md=coaching_md,
        )
    finally:
        conn.close()

    return {
        "saved": saved,
        "measurements": measurements,
        "times": times,
        "f0": f0,
        "confidence": confidence,
        "coaching_md": coaching_md,
        "coaching_error": coaching_error,
    }


def _retry_coaching(session_id: int | None) -> str:
    if not session_id:
        return "No saved session to retry."
    conn = db.connect(DB_PATH)
    try:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if row is None:
            return "Session not found."
        d = dict(row)
        spec = None if d["exercise_spec_json"] is None else json.loads(d["exercise_spec_json"])
        measurements = json.loads(d["measurements_json"])
        history = db.recent_sessions(conn, limit=5)
        coaching = coach.coach(spec, measurements, history)
        conn.execute(
            "UPDATE sessions SET coaching_md = ? WHERE id = ?", (coaching, session_id)
        )
        conn.commit()
        return coaching
    finally:
        conn.close()


def _last_session_id() -> int | None:
    conn = db.connect(DB_PATH)
    try:
        row = conn.execute("SELECT id FROM sessions ORDER BY id DESC LIMIT 1").fetchone()
        return row["id"] if row else None
    finally:
        conn.close()


def _build_setup_ui() -> gr.Blocks:
    with gr.Blocks(title="singing-coach — setup") as setup:
        gr.Markdown("# singing-coach — first-run setup")
        gr.Markdown(
            "Paste your Anthropic API key. It will be saved to "
            f"`{config.USER_CONFIG_FILE}` with mode 0600 and used for coaching."
        )
        key_input = gr.Textbox(label="ANTHROPIC_API_KEY", type="password")
        status = gr.Markdown()
        save_btn = gr.Button("Save and continue", variant="primary")

        def _save(k):
            k = (k or "").strip()
            if not k:
                return "Key cannot be empty."
            config.save_api_key(k)
            return "Key saved. Restart `singing-coach` to use the app."

        save_btn.click(_save, inputs=key_input, outputs=status)
    return setup


def _build_main_ui() -> gr.Blocks:
    with gr.Blocks(title="singing-coach") as app:
        gr.Markdown("# singing-coach")

        with gr.Tabs():
            with gr.Tab("Calibrate"):
                gr.Markdown(
                    "Sing each note for ~3 seconds. The app detects the median pitch."
                )

                with gr.Row():
                    with gr.Column():
                        gr.Markdown("**Lowest comfortable**")
                        low_comf_audio = gr.Audio(
                            sources=["microphone"], type="filepath"
                        )
                        low_comf_midi = gr.State(value=None)
                        low_comf_label = gr.Markdown("(not recorded)")
                    with gr.Column():
                        gr.Markdown("**Highest comfortable**")
                        high_comf_audio = gr.Audio(
                            sources=["microphone"], type="filepath"
                        )
                        high_comf_midi = gr.State(value=None)
                        high_comf_label = gr.Markdown("(not recorded)")
                with gr.Row():
                    with gr.Column():
                        gr.Markdown("**Lowest edge** (vocal floor)")
                        low_edge_audio = gr.Audio(
                            sources=["microphone"], type="filepath"
                        )
                        low_edge_midi = gr.State(value=None)
                        low_edge_label = gr.Markdown("(not recorded)")
                    with gr.Column():
                        gr.Markdown("**Highest edge** (vocal ceiling)")
                        high_edge_audio = gr.Audio(
                            sources=["microphone"], type="filepath"
                        )
                        high_edge_midi = gr.State(value=None)
                        high_edge_label = gr.Markdown("(not recorded)")

                save_calibration_btn = gr.Button("Save calibration", variant="primary")
                calibration_status = gr.Markdown()

                def _on_clip(path):
                    if not path:
                        return None, "(cleared)"
                    midi = _detect_median_midi(Path(path))
                    return midi, _midi_label(midi)

                low_comf_audio.change(
                    _on_clip, inputs=low_comf_audio, outputs=[low_comf_midi, low_comf_label]
                )
                high_comf_audio.change(
                    _on_clip,
                    inputs=high_comf_audio,
                    outputs=[high_comf_midi, high_comf_label],
                )
                low_edge_audio.change(
                    _on_clip, inputs=low_edge_audio, outputs=[low_edge_midi, low_edge_label]
                )
                high_edge_audio.change(
                    _on_clip,
                    inputs=high_edge_audio,
                    outputs=[high_edge_midi, high_edge_label],
                )

                def _save_calibration(lc, hc, le, he):
                    if None in (lc, hc, le, he):
                        return "Need all four notes detected before saving."
                    if not (le <= lc <= hc <= he):
                        return (
                            "Expected: low edge ≤ low comfortable ≤ high comfortable ≤ high edge."
                        )
                    conn = db.connect(DB_PATH)
                    try:
                        db.insert_calibration(
                            conn,
                            range_low=le,
                            range_high=he,
                            tessitura_low=lc,
                            tessitura_high=hc,
                        )
                    finally:
                        conn.close()
                    return (
                        f"Saved. Range: {exercises.midi_to_name(le)}–"
                        f"{exercises.midi_to_name(he)}; "
                        f"tessitura: {exercises.midi_to_name(lc)}–"
                        f"{exercises.midi_to_name(hc)}."
                    )

                save_calibration_btn.click(
                    _save_calibration,
                    inputs=[
                        low_comf_midi,
                        high_comf_midi,
                        low_edge_midi,
                        high_edge_midi,
                    ],
                    outputs=calibration_status,
                )

            with gr.Tab("Exercise"):
                exercise_state = gr.State(value=None)

                with gr.Row():
                    load_btn = gr.Button("Load next exercise", variant="primary")
                    play_btn = gr.Button("Play reference")

                exercise_display = gr.Markdown("(no exercise loaded)")
                reference_audio = gr.Audio(label="Reference tones", autoplay=True)

                record_audio = gr.Audio(
                    sources=["microphone"], type="filepath", label="Record your attempt"
                )
                analyze_btn = gr.Button("Analyze", variant="primary")

                pitch_plot = gr.Plot()
                metrics_md = gr.Markdown()
                coaching_md = gr.Markdown()
                error_md = gr.Markdown()
                retry_btn = gr.Button("Retry coaching", visible=False)
                last_session = gr.State(value=None)

                def _load_exercise():
                    conn = db.connect(DB_PATH)
                    try:
                        cal = db.latest_calibration(conn)
                        n = len(db.all_sessions(conn))
                    finally:
                        conn.close()
                    if cal is None:
                        return None, "**Calibrate first** before loading an exercise."
                    spec = exercises.next_exercise(cal, session_index=n)
                    notes_str = ", ".join(
                        exercises.midi_to_name(m) for m in spec["target_notes_midi"]
                    )
                    md = (
                        f"### {spec['display_name']}\n\n"
                        f"Target notes: {notes_str}\n\n"
                        f"Vowel: **{spec['vowel']}**"
                    )
                    return spec, md

                load_btn.click(_load_exercise, outputs=[exercise_state, exercise_display])

                def _play_reference(spec):
                    if spec is None:
                        return None
                    audio, sr = tone_gen.sequence(
                        spec["target_notes_midi"], spec["duration_per_note_s"]
                    )
                    return (sr, audio)

                play_btn.click(_play_reference, inputs=exercise_state, outputs=reference_audio)

                def _on_analyze(audio_path, spec):
                    if not audio_path:
                        return (
                            None,
                            "",
                            "",
                            "Record audio first.",
                            gr.update(visible=False),
                            None,
                        )
                    result = _analyze(audio_path, spec)
                    fig = _pitch_chart(
                        spec["target_notes_midi"] if spec else None,
                        result["times"],
                        result["f0"],
                        result["confidence"],
                    )
                    session_id = _last_session_id()
                    if result["coaching_error"]:
                        err = f"⚠️ Coaching failed: {result['coaching_error']}"
                        return (
                            fig,
                            _metrics_markdown(result["measurements"]),
                            "",
                            err,
                            gr.update(visible=True),
                            session_id,
                        )
                    return (
                        fig,
                        _metrics_markdown(result["measurements"]),
                        result["coaching_md"],
                        "",
                        gr.update(visible=False),
                        session_id,
                    )

                analyze_btn.click(
                    _on_analyze,
                    inputs=[record_audio, exercise_state],
                    outputs=[
                        pitch_plot,
                        metrics_md,
                        coaching_md,
                        error_md,
                        retry_btn,
                        last_session,
                    ],
                )

                def _on_retry(session_id):
                    coaching = _retry_coaching(session_id)
                    if coaching.startswith("Session not found") or coaching.startswith(
                        "No saved"
                    ):
                        return coaching, ""
                    return coaching, ""

                retry_btn.click(_on_retry, inputs=last_session, outputs=[coaching_md, error_md])

            with gr.Tab("Free-sing"):
                free_audio = gr.Audio(
                    sources=["microphone"], type="filepath", label="Record a passage"
                )
                free_analyze = gr.Button("Analyze", variant="primary")
                free_pitch = gr.Plot()
                free_metrics = gr.Markdown()
                free_coaching = gr.Markdown()
                free_error = gr.Markdown()
                free_retry = gr.Button("Retry coaching", visible=False)
                free_last_session = gr.State(value=None)

                def _on_free(audio_path):
                    if not audio_path:
                        return (
                            None,
                            "",
                            "",
                            "Record audio first.",
                            gr.update(visible=False),
                            None,
                        )
                    result = _analyze(audio_path, None)
                    fig = _pitch_chart(
                        None, result["times"], result["f0"], result["confidence"]
                    )
                    session_id = _last_session_id()
                    if result["coaching_error"]:
                        return (
                            fig,
                            _metrics_markdown(result["measurements"]),
                            "",
                            f"⚠️ Coaching failed: {result['coaching_error']}",
                            gr.update(visible=True),
                            session_id,
                        )
                    return (
                        fig,
                        _metrics_markdown(result["measurements"]),
                        result["coaching_md"],
                        "",
                        gr.update(visible=False),
                        session_id,
                    )

                free_analyze.click(
                    _on_free,
                    inputs=free_audio,
                    outputs=[
                        free_pitch,
                        free_metrics,
                        free_coaching,
                        free_error,
                        free_retry,
                        free_last_session,
                    ],
                )

                free_retry.click(
                    lambda sid: (_retry_coaching(sid), ""),
                    inputs=free_last_session,
                    outputs=[free_coaching, free_error],
                )

            with gr.Tab("Progress"):
                refresh_btn = gr.Button("Refresh", variant="primary")
                progress_plot = gr.Plot()
                session_count = gr.Markdown()

                def _on_refresh():
                    conn = db.connect(DB_PATH)
                    try:
                        sessions = db.all_sessions(conn)
                    finally:
                        conn.close()
                    fig = _progress_chart(sessions)
                    return fig, f"**{len(sessions)} sessions logged.**"

                refresh_btn.click(_on_refresh, outputs=[progress_plot, session_count])

    return app


def main() -> None:
    _ensure_dirs()
    try:
        config.load_api_key()
    except config.MissingApiKeyError:
        _build_setup_ui().launch(inbrowser=True)
        return
    _build_main_ui().launch(inbrowser=True)


if __name__ == "__main__":
    main()
