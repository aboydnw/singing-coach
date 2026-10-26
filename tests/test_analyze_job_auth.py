import base64
import hashlib
import hmac
import json
import time

import pytest

from api import analyze

JOB_ID = "11111111-1111-1111-1111-111111111130"
SECRET = "0123456789abcdef0123456789abcdef"


def token(job_id=JOB_ID, expires_at=None):
    expires_at = expires_at or int(time.time() * 1000) + 60_000
    raw = json.dumps({"jobId": job_id, "expiresAt": expires_at}, separators=(",", ":"))
    payload = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{payload}.{signature}"


def test_internal_job_uses_persisted_audio_key(monkeypatch):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(
        analyze,
        "_load_attempt_job",
        lambda job_id: {
            "id": job_id,
            "audio_key": "user-1/owned.wav",
            "exercise_spec_json": None,
        },
    )
    body, spec = analyze._resolve_internal_job(token())
    assert body["storage_key"] == "user-1/owned.wav"
    assert spec is None


def test_internal_job_rejects_expired_assertion(monkeypatch):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    with pytest.raises(PermissionError, match="expired"):
        analyze._resolve_internal_job(token(expires_at=1))


def test_internal_job_rejects_tampered_assertion(monkeypatch):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    with pytest.raises(PermissionError, match="invalid"):
        analyze._resolve_internal_job(token() + "x")


def test_internal_job_requires_existing_job(monkeypatch):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(analyze, "_load_attempt_job", lambda _job_id: None)
    with pytest.raises(FileNotFoundError, match="attempt job"):
        analyze._resolve_internal_job(token())
