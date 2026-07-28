"""Supabase authentication.

Email and password rather than magic links: the app runs on localhost with no
stable redirect URL to send people back to. The refresh token is cached at
``~/.singing-coach/session.json`` so signing in survives a restart.
"""

import json
import os
import tempfile
from pathlib import Path

from supabase import Client, create_client

from singing_coach import config

SESSION_FILE = config.USER_CONFIG_DIR / "session.json"

_client: Client | None = None
_user: dict | None = None


class AuthError(RuntimeError):
    """Raised when Supabase is unconfigured, or a sign-in attempt fails."""


def is_configured() -> bool:
    """Whether Supabase credentials are present. Sync is inert without them."""
    return config.supabase_credentials() is not None


def current_user() -> dict | None:
    """The signed-in user as {'id', 'email'}, or None when signed out."""
    return _user


def user_id() -> str | None:
    """The signed-in account's id, used to scope every local query."""
    return _user["id"] if _user else None


def client() -> Client:
    """The authenticated Supabase client. Raises AuthError when signed out."""
    if _client is None or _user is None:
        raise AuthError("Not signed in.")
    return _client


def _build_client() -> Client:
    credentials = config.supabase_credentials()
    if credentials is None:
        raise AuthError(
            "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY "
            f"to {config.USER_CONFIG_FILE}."
        )
    url, anon_key = credentials
    return create_client(url, anon_key)


def _store_session(session) -> None:
    config.USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="session.json.", dir=config.USER_CONFIG_DIR, text=True)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"refresh_token": session.refresh_token}, f)
        os.replace(tmp_path, SESSION_FILE)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _adopt(response) -> dict:
    global _user
    if response.session is None or response.user is None:
        raise AuthError(
            "Signed up, but the account needs email confirmation before it can sync. "
            "Check your inbox, then sign in."
        )
    _store_session(response.session)
    _user = {"id": response.user.id, "email": response.user.email}
    return _user


def sign_in(email: str, password: str) -> dict:
    """Sign in with email and password, caching the session for next launch."""
    global _client
    _client = _build_client()
    try:
        response = _client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        _client = None
        raise AuthError(f"Sign-in failed: {exc}") from exc
    return _adopt(response)


def sign_up(email: str, password: str) -> dict:
    """Create an account. Raises AuthError if the project requires email confirmation."""
    global _client
    _client = _build_client()
    try:
        response = _client.auth.sign_up({"email": email, "password": password})
    except Exception as exc:
        _client = None
        raise AuthError(f"Sign-up failed: {exc}") from exc
    return _adopt(response)


def restore() -> dict | None:
    """Re-establish a cached session on launch, or None if there isn't a usable one."""
    global _client, _user
    if not SESSION_FILE.exists() or not is_configured():
        return None
    try:
        refresh_token = json.loads(SESSION_FILE.read_text()).get("refresh_token")
    except (json.JSONDecodeError, OSError):
        return None
    if not refresh_token:
        return None

    try:
        _client = _build_client()
        response = _client.auth.refresh_session(refresh_token)
        return _adopt(response)
    except Exception:
        _client = None
        _user = None
        return None


def sign_out() -> None:
    """Forget the cached session. Local data stays put; it just stops syncing."""
    global _client, _user
    if _client is not None:
        try:
            _client.auth.sign_out()
        except Exception:
            pass
    _client = None
    _user = None
    SESSION_FILE.unlink(missing_ok=True)
