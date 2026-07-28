"""Local coaching via Ollama, using schema-constrained decoding.

Ollama's ``format`` parameter accepts a JSON Schema and constrains generation to
match it, which is what keeps the structured coaching contract — and therefore the
adaptive exercise selection — working without a hosted model.
"""

import json

import httpx

from singing_coach import config


class LocalCoachError(RuntimeError):
    """Raised when the local model is unreachable or returns unusable output."""


def generate(system_prompt: str, user_message: str, schema: dict) -> dict:
    """Ask the local model for JSON matching ``schema``.

    Raises LocalCoachError rather than a transport exception so callers can report
    one recognisable failure regardless of how the local runtime went wrong.
    """
    host = config.ollama_host()
    model = config.ollama_model()
    try:
        response = httpx.post(
            f"{host}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "format": schema,
                "stream": False,
                "options": {"num_predict": config.coach_max_tokens()},
            },
            timeout=config.ollama_timeout_s(),
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        if exc.response.status_code == 404:
            raise LocalCoachError(
                f"Ollama has no model named {model!r}. Pull it with: ollama pull {model}"
            ) from exc
        raise LocalCoachError(f"Ollama returned {exc.response.status_code}: {detail}") from exc
    except httpx.HTTPError as exc:
        raise LocalCoachError(
            f"Could not reach Ollama at {host}. Is it running? ({exc})"
        ) from exc

    content = response.json().get("message", {}).get("content", "")
    if not content.strip():
        raise LocalCoachError(f"Model {model!r} returned an empty response.")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise LocalCoachError(
            f"Model {model!r} did not return valid JSON: {content[:200]}"
        ) from exc


def installed_models() -> list[str]:
    """Model names available on the local Ollama server, or [] if it is unreachable."""
    try:
        response = httpx.get(f"{config.ollama_host()}/api/tags", timeout=5.0)
        response.raise_for_status()
    except httpx.HTTPError:
        return []
    return [model["name"] for model in response.json().get("models", [])]


def availability() -> tuple[bool, str]:
    """Whether coaching can run locally right now, and a message explaining the state."""
    models = installed_models()
    if not models:
        return False, (
            f"No local model server at {config.ollama_host()}. "
            "Start Ollama, or set SINGING_COACH_BACKEND=anthropic."
        )
    wanted = config.ollama_model()
    if wanted not in models:
        return False, (
            f"Ollama is running but {wanted!r} is not installed. "
            f"Pull it with `ollama pull {wanted}`, or set SINGING_COACH_OLLAMA_MODEL "
            f"to one of: {', '.join(sorted(models))}."
        )
    return True, f"Coaching locally with {wanted} — no API costs."
