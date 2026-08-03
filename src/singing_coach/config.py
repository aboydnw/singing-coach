"""Settings resolution: process env, then project .env, then the user-global .env."""

import os
import tempfile
from pathlib import Path

from dotenv import dotenv_values

API_KEY_VAR = "ANTHROPIC_API_KEY"
SUPABASE_URL_VAR = "SUPABASE_URL"
SUPABASE_ANON_KEY_VAR = "SUPABASE_ANON_KEY"
BACKEND_VAR = "SINGING_COACH_BACKEND"

COACH_MODEL_VAR = "SINGING_COACH_MODEL"
COACH_MAX_TOKENS_VAR = "SINGING_COACH_MAX_TOKENS"
COACH_TIMEOUT_VAR = "SINGING_COACH_TIMEOUT_S"
OLLAMA_HOST_VAR = "SINGING_COACH_OLLAMA_HOST"
OLLAMA_MODEL_VAR = "SINGING_COACH_OLLAMA_MODEL"
OLLAMA_TIMEOUT_VAR = "SINGING_COACH_OLLAMA_TIMEOUT_S"

SERVER_HOST_VAR = "SINGING_COACH_HOST"
SERVER_PORT_VAR = "SINGING_COACH_PORT"
SHARE_VAR = "SINGING_COACH_SHARE"

USER_CONFIG_DIR = Path.home() / ".singing-coach"
USER_CONFIG_FILE = USER_CONFIG_DIR / ".env"
PROJECT_DOTENV = Path(".env")

ANTHROPIC_BACKEND = "anthropic"
OLLAMA_BACKEND = "ollama"
DEFAULT_BACKEND = OLLAMA_BACKEND

DEFAULT_COACH_MODEL = "claude-sonnet-4-6"
DEFAULT_COACH_MAX_TOKENS = 1024
DEFAULT_COACH_TIMEOUT_S = 60.0

DEFAULT_SERVER_HOST = "127.0.0.1"

DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen2.5:3b"
DEFAULT_OLLAMA_TIMEOUT_S = 600.0


def setting(name: str) -> str | None:
    """One setting, preferring the process env, then the project .env, then the user .env."""
    env_value = os.environ.get(name)
    if env_value:
        return env_value

    for candidate in (Path.cwd() / PROJECT_DOTENV, USER_CONFIG_FILE):
        if candidate.exists():
            value = dotenv_values(candidate).get(name)
            if value:
                return value
    return None


def coach_backend() -> str:
    """Which coaching backend to use: 'ollama' (local, free) or 'anthropic' (API, paid)."""
    return (setting(BACKEND_VAR) or DEFAULT_BACKEND).strip().lower()


def uses_anthropic() -> bool:
    """Whether the configured backend needs an Anthropic API key."""
    return coach_backend() == ANTHROPIC_BACKEND


def coach_model() -> str:
    """The Claude model used for coaching, overridable via SINGING_COACH_MODEL."""
    return setting(COACH_MODEL_VAR) or DEFAULT_COACH_MODEL


def coach_max_tokens() -> int:
    """Max output tokens per coaching call, overridable via SINGING_COACH_MAX_TOKENS."""
    return int(setting(COACH_MAX_TOKENS_VAR) or DEFAULT_COACH_MAX_TOKENS)


def coach_timeout_s() -> float:
    """API timeout in seconds, overridable via SINGING_COACH_TIMEOUT_S."""
    return float(setting(COACH_TIMEOUT_VAR) or DEFAULT_COACH_TIMEOUT_S)


def ollama_host() -> str:
    """Base URL of the Ollama server, overridable via SINGING_COACH_OLLAMA_HOST."""
    return (setting(OLLAMA_HOST_VAR) or DEFAULT_OLLAMA_HOST).rstrip("/")


def ollama_model() -> str:
    """The local model used for coaching, overridable via SINGING_COACH_OLLAMA_MODEL."""
    return setting(OLLAMA_MODEL_VAR) or DEFAULT_OLLAMA_MODEL


def ollama_timeout_s() -> float:
    """Local generation timeout. Generous by default: CPU-only inference is slow."""
    return float(setting(OLLAMA_TIMEOUT_VAR) or DEFAULT_OLLAMA_TIMEOUT_S)


def server_host() -> str:
    """Interface to bind. Defaults to loopback; set to 0.0.0.0 to serve behind a proxy."""
    return setting(SERVER_HOST_VAR) or DEFAULT_SERVER_HOST


def server_port() -> int | None:
    """Port to bind, or None to let Gradio pick the first free one."""
    raw = setting(SERVER_PORT_VAR)
    return int(raw) if raw else None


def share() -> bool:
    """Whether to open a public Gradio tunnel. Useful when no proxy is set up yet."""
    return (setting(SHARE_VAR) or "").strip().lower() in ("1", "true", "yes", "on")


def supabase_credentials() -> tuple[str, str] | None:
    """The Supabase project URL and anon key, or None when sync is not configured."""
    url = setting(SUPABASE_URL_VAR)
    anon_key = setting(SUPABASE_ANON_KEY_VAR)
    if url and anon_key:
        return url, anon_key
    return None


class MissingApiKeyError(RuntimeError):
    """Raised when no Anthropic API key can be found in any configured source."""


def load_api_key() -> str:
    key = setting(API_KEY_VAR)
    if key:
        return key
    raise MissingApiKeyError(
        f"{API_KEY_VAR} not found in environment, project .env, or {USER_CONFIG_FILE}"
    )


def save_settings(values: dict[str, str]) -> None:
    """Merge settings into the user-global .env, preserving anything already there.

    Written via a temp file so a crash mid-write cannot truncate existing credentials.
    """
    USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    merged = dict(dotenv_values(USER_CONFIG_FILE)) if USER_CONFIG_FILE.exists() else {}
    merged.update(values)
    data = "".join(f"{key}={value}\n" for key, value in merged.items() if value is not None)

    fd, tmp_name = tempfile.mkstemp(
        prefix=f"{USER_CONFIG_FILE.name}.",
        dir=USER_CONFIG_DIR,
        text=True,
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp_path, USER_CONFIG_FILE)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def save_api_key(key: str) -> None:
    """Store the Anthropic API key without disturbing other saved settings."""
    save_settings({API_KEY_VAR: key})


def save_supabase_credentials(url: str, anon_key: str) -> None:
    """Store Supabase project credentials alongside the other user-global settings."""
    save_settings({SUPABASE_URL_VAR: url, SUPABASE_ANON_KEY_VAR: anon_key})
