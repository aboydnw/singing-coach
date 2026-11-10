"""Service-only, atomic admission control for expensive Python operations.

Consume once per real execution, including retries. Never refund a reservation:
network failures can leave the transaction's outcome unknown.
"""

import httpx
import soundfile as sf

MAX_AUDIO_SECONDS = 120


class CostGuardUnavailable(Exception):
    pass


class CostLimitExceeded(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = max(1, retry_after)
        super().__init__("usage limit reached")


def consume_operation(uid: str, operation: str, url: str, key: str) -> None:
    if not url or not key or not isinstance(uid, str) or not uid:
        raise CostGuardUnavailable()
    try:
        with httpx.Client(timeout=10) as client:
            response = client.post(
                f"{url.rstrip('/')}/rest/v1/rpc/consume_cost_operation",
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                json={"p_user_id": uid, "p_operation": operation},
            )
            response.raise_for_status()
            result = response.json()
        if (
            not isinstance(result, dict)
            or type(result.get("allowed")) is not bool
            or not isinstance(result.get("reason"), str)
            or type(result.get("retry_after")) is not int
            or not 0 <= result["retry_after"] <= 366 * 24 * 60 * 60
        ):
            raise ValueError("invalid admission response")
    except Exception as exc:
        raise CostGuardUnavailable() from exc
    if result["allowed"] and (result["reason"] != "allowed" or result["retry_after"] != 0):
        raise CostGuardUnavailable()
    if not result["allowed"]:
        if result["reason"] not in {"global_limit", "account_limit"}:
            raise CostGuardUnavailable()
        raise CostLimitExceeded(result["retry_after"])


def validate_audio_duration(path) -> None:
    """Inspect the header before decoding, resampling, pitch inference or DSP."""
    info = sf.info(path)
    if info.samplerate <= 0 or info.frames <= 0:
        raise ValueError("invalid recording")
    if info.frames > MAX_AUDIO_SECONDS * info.samplerate:
        raise ValueError("recording exceeds the duration limit")
