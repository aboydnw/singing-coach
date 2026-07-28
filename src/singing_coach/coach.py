"""Anthropic coaching wrapper. Structured feedback via tool use, with session memory."""

import json

import anthropic

from singing_coach import config
from singing_coach.models import CoachingResult, ExerciseSpec, FocusArea, Measurements

SYSTEM_PROMPT = """You are a vocal coach giving measurement-backed feedback after a sung exercise.
Be specific, actionable, and musically literate. Lead with the single most important thing to work on.

Measurement glossary:
- jitter_local: Pitch period instability. Elevated jitter (>0.02) suggests inconsistent breath
  support or vocal fatigue.
- shimmer_local: Amplitude period instability. Same physiological signal as jitter from a different
  angle.
- hnr_mean: Harmonic-to-noise ratio (dB). Lower = breathier tone. Healthy clean singing is >20 dB.
- vibrato_rate_hz: Vibrato oscillation rate. Healthy pop/classical range is ~5-6 Hz.
- vibrato_extent_cents: Vibrato depth. Wide-but-controlled is ~50-100 cents.
- f1_mean, f2_mean: First/second formant means. Useful proxies for vowel placement and
  open-throat technique.
- accuracy: Per-note pitch accuracy against the exercise's targets. cents_off is signed:
  negative = flat, positive = sharp. Within ±25 cents is on pitch; beyond ±50 is clearly off.

The history block contains recent sessions, newest first, including the advice you gave after
each one. Follow up on your own prior advice: if the singer worked on what you suggested,
say whether the numbers moved and acknowledge progress or regression before introducing
anything new."""

COACHING_TOOL = {
    "name": "give_coaching",
    "description": "Deliver structured coaching feedback for the sung attempt.",
    "input_schema": {
        "type": "object",
        "properties": {
            "focus_area": {
                "type": "string",
                "enum": [f.value for f in FocusArea],
                "description": "The single skill most worth working on next.",
            },
            "top_issue": {
                "type": "string",
                "description": "One-line headline of the most important thing to work on.",
            },
            "why": {
                "type": "string",
                "description": (
                    "What the measurements show and why it matters, in plain language a "
                    "non-expert singer understands. Reference prior sessions when relevant."
                ),
            },
            "drill": {
                "type": "string",
                "description": "One concrete drill to practice before the next attempt.",
            },
            "encouragement": {
                "type": "string",
                "description": "One genuine, specific positive from this attempt.",
            },
        },
        "required": ["focus_area", "top_issue", "why", "drill", "encouragement"],
    },
}


def _build_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=config.load_api_key(),
        timeout=config.coach_timeout_s(),
        max_retries=2,
    )


def _history_payload(history: list[dict]) -> list[dict]:
    entries = []
    for h in history:
        measurements = h.get("measurements")
        if isinstance(measurements, Measurements):
            measurements = measurements.model_dump(exclude_none=True)
        entry = {
            "ts": h.get("ts"),
            "exercise_type": h.get("exercise_type"),
            "measurements": measurements,
        }
        coaching = h.get("coaching")
        if isinstance(coaching, CoachingResult):
            entry["advice_given"] = {
                "focus_area": coaching.focus_area.value,
                "top_issue": coaching.top_issue,
                "drill": coaching.drill,
            }
        entries.append(entry)
    return entries


def _format_user_message(
    exercise_spec: ExerciseSpec | None,
    measurements: Measurements,
    history: list[dict],
) -> str:
    blocks = []
    if exercise_spec is not None:
        blocks.append(
            f"<exercise>\n{exercise_spec.model_dump_json(indent=2)}\n</exercise>"
        )
    blocks.append(
        "<measurements>\n"
        f"{measurements.model_dump_json(indent=2, exclude_none=True)}\n"
        "</measurements>"
    )
    blocks.append(
        f"<history>\n{json.dumps(_history_payload(history), indent=2)}\n</history>"
    )
    blocks.append(
        "<task>Coach me. Lead with the most important thing to work on. "
        "Specific, actionable. Follow up on your prior advice if history shows any.</task>"
    )
    return "\n\n".join(blocks)


def coach(
    exercise_spec: ExerciseSpec | None,
    measurements: Measurements,
    history: list[dict],
) -> CoachingResult:
    client = _build_client()
    response = client.messages.create(
        model=config.coach_model(),
        max_tokens=config.coach_max_tokens(),
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[COACHING_TOOL],
        tool_choice={"type": "tool", "name": "give_coaching"},
        messages=[
            {
                "role": "user",
                "content": _format_user_message(exercise_spec, measurements, history),
            }
        ],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return CoachingResult.model_validate(block.input)
    raise RuntimeError("Anthropic response did not include coaching tool output")
