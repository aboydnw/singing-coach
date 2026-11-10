"""All network/DSP calls are mocked; these tests never spend provider credits."""
import io
import json
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest

from api import analyze, resynth
import _cost_guard as guard
from tests.test_analyze_job_auth import SECRET, token


@pytest.fixture(params=[analyze, resynth], ids=["analyze", "resynth"])
def endpoint(request, monkeypatch):
    module = request.param
    monkeypatch.setattr(module, "_verify_jwt", Mock(return_value="user-1"))
    monkeypatch.setattr(module, "consume_operation", Mock())
    monkeypatch.setattr(module, "run_analysis" if module is analyze else "run_resynth", Mock(return_value={"ok": True}))
    return module


def invoke(module, payload=None, headers=None, raw=None):
    if raw is None:
        raw = json.dumps(payload if payload is not None else {
            "storage_key": "user-1/clip.wav", "correction": "steady_pitch"
        }).encode()
    obj = object.__new__(module.handler)
    obj.headers = {"Content-Length": str(len(raw)), "Authorization": "Bearer test", **(headers or {})}
    obj.rfile, obj.wfile = io.BytesIO(raw), io.BytesIO()
    obj.send_response, obj.send_header, obj.end_headers = Mock(), Mock(), Mock()
    obj.do_POST()
    return obj


def runner(module):
    return module.run_analysis if module is analyze else module.run_resynth


@pytest.mark.parametrize("error,status", [(guard.CostLimitExceeded(42), 429), (guard.CostGuardUnavailable(), 503)])
def test_denial_prevents_all_work(endpoint, error, status):
    endpoint.consume_operation.side_effect = error
    result = invoke(endpoint)
    result.send_response.assert_called_once_with(status)
    runner(endpoint).assert_not_called()
    if status == 429:
        result.send_header.assert_any_call("Retry-After", "42")


def test_each_real_retry_is_charged_before_execution(endpoint):
    events = []
    endpoint.consume_operation.side_effect = lambda *args: events.append(("guard", args[:2]))
    def failed(*args):
        events.append(("work", None))
        raise RuntimeError("uncertain failure")
    runner(endpoint).side_effect = failed
    invoke(endpoint)
    invoke(endpoint)
    operation = "analyze" if endpoint is analyze else "resynth"
    assert events == [("guard", ("user-1", operation)), ("work", None)] * 2


@pytest.mark.parametrize("payload", [[], None, 1, "hello", True])
def test_non_object_body_rejected(endpoint, payload):
    result = invoke(endpoint, raw=json.dumps(payload).encode())
    result.send_response.assert_called_once_with(400)
    endpoint.consume_operation.assert_not_called()
    runner(endpoint).assert_not_called()


@pytest.mark.parametrize("length,status", [("-1", 400), ("16385", 413), ("nonsense", 400)])
def test_body_size_rejected_before_read(endpoint, length, status):
    result = invoke(endpoint, headers={"Content-Length": length})
    result.send_response.assert_called_once_with(status)
    assert result.rfile.tell() == 0
    endpoint.consume_operation.assert_not_called()


def test_foreign_storage_key_does_not_consume(endpoint):
    result = invoke(endpoint, payload={"storage_key": "other-user/clip.wav", "correction": "steady_pitch"})
    result.send_response.assert_called_once_with(403)
    endpoint.consume_operation.assert_not_called()


def test_internal_job_charges_persisted_owner(monkeypatch):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(analyze, "_load_attempt_job", Mock(return_value={
        "user_id": "job-owner", "audio_key": "job-owner/clip.wav", "status": "analyzing", "exercise_spec_json": None,
    }))
    consume, work = Mock(), Mock(return_value={})
    monkeypatch.setattr(analyze, "consume_operation", consume)
    monkeypatch.setattr(analyze, "run_analysis", work)
    result = invoke(analyze, payload={"user_id": "attacker", "storage_key": "attacker/clip.wav"}, headers={"X-Attempt-Job-Assertion": token()})
    result.send_response.assert_called_once_with(200)
    assert consume.call_args.args[:2] == ("job-owner", "analyze")
    assert work.call_args.args[0]["storage_key"] == "job-owner/clip.wav"


@pytest.mark.parametrize("status", ["completed", "failed", "abandoned", "coaching", "queued", None])
def test_inactive_job_cannot_consume_or_run(monkeypatch, status):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(analyze, "_load_attempt_job", lambda _: {"user_id": "user-1", "audio_key": "user-1/clip.wav", "status": status})
    consume, work = Mock(), Mock()
    monkeypatch.setattr(analyze, "consume_operation", consume)
    monkeypatch.setattr(analyze, "run_analysis", work)
    result = invoke(analyze, headers={"X-Attempt-Job-Assertion": token()})
    result.send_response.assert_called_once_with(401)
    consume.assert_not_called()
    work.assert_not_called()


@pytest.mark.parametrize("job", [
    {"status": "analyzing", "audio_key": "user-1/clip.wav"},
    {"status": "analyzing", "user_id": "user-1", "audio_key": "other/clip.wav"},
])
def test_internal_job_must_have_matching_owner(monkeypatch, job):
    monkeypatch.setenv("ATTEMPT_JOB_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(analyze, "_load_attempt_job", lambda _: job)
    with pytest.raises((ValueError, PermissionError)):
        analyze._resolve_internal_job(token())


@pytest.mark.parametrize("result", [None, [], {}, {"allowed": "true", "reason": "allowed", "retry_after": 0}, {"allowed": True, "reason": "allowed", "retry_after": True}, {"allowed": True, "reason": "allowed", "retry_after": -1}])
def test_rpc_malformed_results_fail_closed(monkeypatch, result):
    client = Mock()
    client.post.return_value.json.return_value = result
    # Mock context manager explicitly so no request can escape the test.
    from unittest.mock import MagicMock
    context = MagicMock()
    context.__enter__.return_value = client
    monkeypatch.setattr(guard.httpx, "Client", Mock(return_value=context))
    with pytest.raises(guard.CostGuardUnavailable):
        guard.consume_operation("user-1", "analyze", "https://example.test", "service-key")


def rpc_client(monkeypatch):
    from unittest.mock import MagicMock
    context = MagicMock()
    client = context.__enter__.return_value
    monkeypatch.setattr(guard.httpx, "Client", Mock(return_value=context))
    return client


def test_rpc_uses_service_credentials_and_exact_contract(monkeypatch):
    client = rpc_client(monkeypatch)
    client.post.return_value.json.return_value = {"allowed": True, "reason": "allowed", "retry_after": 0}
    guard.consume_operation("user-1", "analyze", "https://example.test/", "service-key")
    client.post.assert_called_once_with("https://example.test/rest/v1/rpc/consume_cost_operation", headers={"apikey": "service-key", "Authorization": "Bearer service-key"}, json={"p_user_id": "user-1", "p_operation": "analyze"})


def test_rpc_denial_and_outage(monkeypatch):
    client = rpc_client(monkeypatch)
    client.post.return_value.json.return_value = {"allowed": False, "reason": "global_limit", "retry_after": 60}
    with pytest.raises(guard.CostLimitExceeded) as error:
        guard.consume_operation("user-1", "resynth", "https://example.test", "key")
    assert error.value.retry_after == 60
    client.post.side_effect = httpx.ReadTimeout("unknown outcome")
    with pytest.raises(guard.CostGuardUnavailable):
        guard.consume_operation("user-1", "resynth", "https://example.test", "key")
    assert client.post.call_count == 2  # no automatic retry/refund


@pytest.mark.parametrize("url,key", [("", "key"), ("https://example.test", "")])
def test_missing_config_makes_no_network_call(monkeypatch, url, key):
    client = rpc_client(monkeypatch)
    with pytest.raises(guard.CostGuardUnavailable):
        guard.consume_operation("user-1", "analyze", url, key)
    client.post.assert_not_called()


@pytest.mark.parametrize("seconds", [0, 120.01, 10000])
def test_duration_limits_before_decode(monkeypatch, seconds):
    monkeypatch.setattr(guard.sf, "info", lambda _: audio_info(frames=int(seconds * 48000)))
    with pytest.raises(ValueError):
        guard.validate_audio_duration("unused.wav")


def test_duration_boundary_allowed_without_resampling(monkeypatch):
    monkeypatch.setattr(guard.sf, "info", lambda _: audio_info(frames=120 * 48000))
    guard.validate_audio_duration("unused.wav")


@pytest.mark.parametrize("module", [analyze, resynth])
def test_duration_check_precedes_dsp_and_cleans_temp_files(monkeypatch, module):
    paths = []
    monkeypatch.setattr(module, "_download", lambda key, path: paths.append(path))
    monkeypatch.setattr(module, "validate_audio_duration", Mock(side_effect=ValueError("too long")))
    loader = Mock()
    monkeypatch.setattr(module.audio_io if module is analyze else module.resynth, "load", loader)
    with pytest.raises(ValueError):
        if module is analyze:
            module.run_analysis({"storage_key": "user-1/clip.wav"}, None)
        else:
            module.run_resynth("user-1/clip.wav", "steady_pitch", "user-1")
    loader.assert_not_called()
    assert paths and all(not p.exists() for p in paths)


def test_unauthenticated_request_cannot_consume(endpoint):
    endpoint._verify_jwt.side_effect = PermissionError("no token")
    result = invoke(endpoint)
    result.send_response.assert_called_once_with(401)
    endpoint.consume_operation.assert_not_called()
    runner(endpoint).assert_not_called()


def test_rpc_http_failure_is_unavailable_not_permission_to_run(monkeypatch):
    client = rpc_client(monkeypatch)
    client.post.return_value.raise_for_status.side_effect = httpx.HTTPStatusError(
        "database unavailable", request=httpx.Request("POST", "https://example.test"),
        response=httpx.Response(500),
    )
    with pytest.raises(guard.CostGuardUnavailable):
        guard.consume_operation("user-1", "analyze", "https://example.test", "key")
    client.post.return_value.json.assert_not_called()


def test_invalid_correction_type_returns_validation_error(monkeypatch):
    monkeypatch.setattr(resynth, "_verify_jwt", lambda _: "user-1")
    consume = Mock()
    monkeypatch.setattr(resynth, "consume_operation", consume)
    result = invoke(resynth, payload={"storage_key": "user-1/clip.wav", "correction": {}})
    result.send_response.assert_called_once_with(400)
    consume.assert_not_called()


@pytest.mark.parametrize("reason", ["unavailable", "unexpected_reason"])
def test_rpc_non_quota_denials_are_unavailable(monkeypatch, reason):
    client = rpc_client(monkeypatch)
    client.post.return_value.json.return_value = {"allowed": False, "reason": reason, "retry_after": 60}
    with pytest.raises(guard.CostGuardUnavailable):
        guard.consume_operation("user-1", "analyze", "https://example.test", "key")



def audio_info(**overrides):
    values = {"format": "WAV", "subtype": "PCM_16", "channels": 1, "samplerate": 48000, "frames": 48000}
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.parametrize("overrides", [
    {"format": "FLAC"}, {"format": "OGG"}, {"format": "MPEG"},
    {"format": None}, {"subtype": "IMA_ADPCM"}, {"subtype": "GSM610"},
    {"subtype": None}, {"channels": 0}, {"channels": 3}, {"channels": 65535},
    {"channels": True}, {"channels": 1.0}, {"samplerate": 7999},
    {"samplerate": 192001}, {"samplerate": 2147483647}, {"samplerate": 0},
    {"samplerate": float("nan")}, {"samplerate": float("inf")},
    {"frames": -1}, {"frames": None}, {"frames": float("nan")},
    {"frames": float("inf")}, {"frames": True},
])
def test_unsafe_audio_metadata_rejected(monkeypatch, overrides):
    monkeypatch.setattr(guard.sf, "info", lambda _: audio_info(**overrides))
    with pytest.raises(ValueError):
        guard.validate_audio_duration("disguised.wav")


@pytest.mark.parametrize("rate", [8000, 16000, 44100, 48000, 96000, 192000])
@pytest.mark.parametrize("channels", [1, 2])
@pytest.mark.parametrize("format", ["WAV", "WAVEX"])
def test_native_rate_wav_metadata_accepted(monkeypatch, rate, channels, format):
    monkeypatch.setattr(guard.sf, "info", lambda _: audio_info(
        samplerate=rate, frames=120 * rate, channels=channels, format=format,
    ))
    guard.validate_audio_duration("native.wav")


def test_unreadable_audio_is_rejected_without_fallback(monkeypatch):
    monkeypatch.setattr(guard.sf, "info", Mock(side_effect=RuntimeError("bad header")))
    with pytest.raises(ValueError, match="invalid recording"):
        guard.validate_audio_duration("broken.wav")


def test_real_container_inspection_ignores_wav_extension(tmp_path):
    import numpy as np
    path = tmp_path / "recording.wav"
    guard.sf.write(path, np.zeros(100), 48000, format="FLAC")
    with pytest.raises(ValueError, match="unsupported"):
        guard.validate_audio_duration(path)
    guard.sf.write(path, np.zeros((100, 3)), 48000, format="WAV", subtype="PCM_16")
    with pytest.raises(ValueError, match="unsupported"):
        guard.validate_audio_duration(path)
    guard.sf.write(path, np.zeros(100), 48000, format="WAV", subtype="PCM_16")
    guard.validate_audio_duration(path)
