import json
import stat

import pytest

from singing_coach import auth, config


class FakeSession:
    def __init__(self, refresh_token="refresh-123"):
        self.refresh_token = refresh_token
        self.access_token = "access-123"


class FakeUser:
    def __init__(self, user_id="user-a", email="singer@example.com"):
        self.id = user_id
        self.email = email


class FakeAuthResponse:
    def __init__(self, session=FakeSession(), user=FakeUser()):
        self.session = session
        self.user = user


class FakeAuthAPI:
    def __init__(self, response=None, error=None):
        self.response = response if response is not None else FakeAuthResponse()
        self.error = error
        self.calls = []

    def sign_in_with_password(self, credentials):
        self.calls.append(("sign_in", credentials))
        if self.error:
            raise RuntimeError(self.error)
        return self.response

    def sign_up(self, credentials):
        self.calls.append(("sign_up", credentials))
        if self.error:
            raise RuntimeError(self.error)
        return self.response

    def refresh_session(self, refresh_token):
        self.calls.append(("refresh", refresh_token))
        if self.error:
            raise RuntimeError(self.error)
        return self.response

    def sign_out(self):
        self.calls.append(("sign_out", None))


class FakeClient:
    def __init__(self, response=None, error=None):
        self.auth = FakeAuthAPI(response, error)


@pytest.fixture(autouse=True)
def isolated_auth(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USER_CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "USER_CONFIG_FILE", tmp_path / ".env")
    monkeypatch.setattr(auth, "SESSION_FILE", tmp_path / "session.json")
    monkeypatch.setattr(auth, "_client", None)
    monkeypatch.setattr(auth, "_user", None)
    monkeypatch.setattr(config, "supabase_credentials", lambda: ("https://x.supabase.co", "anon"))
    yield tmp_path
    auth._client = None
    auth._user = None


def _install(monkeypatch, client):
    monkeypatch.setattr(auth, "_build_client", lambda: client)
    return client


def test_is_configured_follows_the_credentials(monkeypatch):
    assert auth.is_configured() is True
    monkeypatch.setattr(config, "supabase_credentials", lambda: None)
    assert auth.is_configured() is False


def test_sign_in_records_the_user(monkeypatch):
    client = _install(monkeypatch, FakeClient())
    user = auth.sign_in("singer@example.com", "hunter2")

    assert user["email"] == "singer@example.com"
    assert auth.user_id() == "user-a"
    assert client.auth.calls[0][0] == "sign_in"


def test_sign_in_caches_the_refresh_token(monkeypatch, isolated_auth):
    _install(monkeypatch, FakeClient())
    auth.sign_in("singer@example.com", "hunter2")

    stored = json.loads(auth.SESSION_FILE.read_text())
    assert stored["refresh_token"] == "refresh-123"


def test_cached_session_never_stores_the_access_token(monkeypatch):
    _install(monkeypatch, FakeClient())
    auth.sign_in("singer@example.com", "hunter2")

    assert "access-123" not in auth.SESSION_FILE.read_text()


def test_sign_in_failure_leaves_the_user_signed_out(monkeypatch):
    _install(monkeypatch, FakeClient(error="invalid credentials"))
    with pytest.raises(auth.AuthError):
        auth.sign_in("singer@example.com", "wrong")

    assert auth.current_user() is None
    assert auth.user_id() is None


def test_sign_up_needing_confirmation_is_reported(monkeypatch):
    _install(monkeypatch, FakeClient(FakeAuthResponse(session=None, user=None)))
    with pytest.raises(auth.AuthError) as excinfo:
        auth.sign_up("singer@example.com", "hunter2")

    assert "confirmation" in str(excinfo.value).lower()


def test_client_raises_when_signed_out():
    with pytest.raises(auth.AuthError):
        auth.client()


def test_restore_returns_none_without_a_cached_session():
    assert auth.restore() is None


def test_restore_reestablishes_a_cached_session(monkeypatch):
    auth.SESSION_FILE.write_text(json.dumps({"refresh_token": "refresh-123"}))
    client = _install(monkeypatch, FakeClient())

    user = auth.restore()

    assert user["id"] == "user-a"
    assert client.auth.calls[0] == ("refresh", "refresh-123")


def test_restore_survives_an_expired_token(monkeypatch):
    auth.SESSION_FILE.write_text(json.dumps({"refresh_token": "stale"}))
    _install(monkeypatch, FakeClient(error="token expired"))

    assert auth.restore() is None
    assert auth.current_user() is None


def test_restore_survives_a_corrupt_cache(monkeypatch):
    auth.SESSION_FILE.write_text("not json")
    _install(monkeypatch, FakeClient())

    assert auth.restore() is None


def test_sign_out_forgets_the_cached_session(monkeypatch):
    _install(monkeypatch, FakeClient())
    auth.sign_in("singer@example.com", "hunter2")

    auth.sign_out()

    assert auth.current_user() is None
    assert not auth.SESSION_FILE.exists()


def test_build_client_requires_configuration(monkeypatch):
    monkeypatch.setattr(config, "supabase_credentials", lambda: None)
    with pytest.raises(auth.AuthError):
        auth._build_client()


def test_session_file_is_not_world_readable(monkeypatch):
    _install(monkeypatch, FakeClient())
    auth.sign_in("singer@example.com", "hunter2")

    mode = stat.S_IMODE(auth.SESSION_FILE.stat().st_mode)
    assert mode & 0o077 == 0
