"""API-key configuration: load from process env or .env files, save to user-global .env."""

import os
import tempfile
from pathlib import Path

from dotenv import dotenv_values

API_KEY_VAR = "ANTHROPIC_API_KEY"
USER_CONFIG_DIR = Path.home() / ".singing-coach"
USER_CONFIG_FILE = USER_CONFIG_DIR / ".env"
PROJECT_DOTENV = Path(".env")

DEFAULT_COACH_MODEL = "claude-sonnet-4-6"
DEFAULT_COACH_MAX_TOKENS = 1024
DEFAULT_COACH_TIMEOUT_S = 60.0


def coach_model() -> str:
    """The Claude model used for coaching, overridable via SINGING_COACH_MODEL."""
    return os.environ.get("SINGING_COACH_MODEL", DEFAULT_COACH_MODEL)


def coach_max_tokens() -> int:
    """Max output tokens per coaching call, overridable via SINGING_COACH_MAX_TOKENS."""
    return int(os.environ.get("SINGING_COACH_MAX_TOKENS", DEFAULT_COACH_MAX_TOKENS))


def coach_timeout_s() -> float:
    """API timeout in seconds, overridable via SINGING_COACH_TIMEOUT_S."""
    return float(os.environ.get("SINGING_COACH_TIMEOUT_S", DEFAULT_COACH_TIMEOUT_S))


class MissingApiKeyError(RuntimeError):
    """Raised when no Anthropic API key can be found in any configured source."""


def load_api_key() -> str:
    env_value = os.environ.get(API_KEY_VAR)
    if env_value:
        return env_value

    for candidate in (Path.cwd() / PROJECT_DOTENV, USER_CONFIG_FILE):
        if candidate.exists():
            values = dotenv_values(candidate)
            key = values.get(API_KEY_VAR)
            if key:
                return key

    raise MissingApiKeyError(
        f"{API_KEY_VAR} not found in environment, project .env, or {USER_CONFIG_FILE}"
    )


def save_api_key(key: str) -> None:
    USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = f"{API_KEY_VAR}={key}\n"
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
