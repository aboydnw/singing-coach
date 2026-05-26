"""API-key configuration: load from process env or .env files, save to user-global .env."""

import os
from pathlib import Path

from dotenv import dotenv_values

API_KEY_VAR = "ANTHROPIC_API_KEY"
USER_CONFIG_DIR = Path.home() / ".singing-coach"
USER_CONFIG_FILE = USER_CONFIG_DIR / ".env"
PROJECT_DOTENV = Path(".env")


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
    USER_CONFIG_FILE.write_text(f"{API_KEY_VAR}={key}\n")
    USER_CONFIG_FILE.chmod(0o600)
