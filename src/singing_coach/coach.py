"""Anthropic coaching wrapper. Sends measurements + history to Claude for feedback."""

import json

import anthropic

from singing_coach import config

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024

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
"""


def _build_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=config.load_api_key())


def _format_user_message(
    exercise_spec: dict | None, measurements: dict, history: list[dict]
) -> str:
    blocks = []
    if exercise_spec is not None:
        blocks.append(f"<exercise>\n{json.dumps(exercise_spec, indent=2)}\n</exercise>")
    blocks.append(
        f"<measurements>\n{json.dumps(measurements, indent=2)}\n</measurements>"
    )
    history_payload = [h.get("measurements", h) for h in history]
    blocks.append(f"<history>\n{json.dumps(history_payload, indent=2)}\n</history>")
    blocks.append(
        "<task>Coach me. Lead with the most important thing to work on. "
        "Specific, actionable.</task>"
    )
    return "\n\n".join(blocks)


def coach(
    exercise_spec: dict | None,
    measurements: dict,
    history: list[dict],
) -> str:
    client = _build_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": _format_user_message(exercise_spec, measurements, history),
            }
        ],
    )
    return next(block.text for block in response.content if block.type == "text")
