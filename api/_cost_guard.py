"""Service-only, atomic admission control for expensive Python operations.

Consume once per real execution, including retries. Never refund a reservation:
network failures can leave the transaction's outcome unknown.
"""

import httpx
import soundfile as sf

MAX_AUDIO_SECONDS = 120
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 192000
# Browser uploads are mono PCM_16 WAV at the native AudioBuffer sample rate.
# Also accept ordinary stereo/uncompressed WAV variants without changing the
# existing server-side mono conversion and 16 kHz resampling contract.
WAV_FORMATS = {"WAV", "WAVEX"}
PCM_SUBTYPES = {"PCM_U8", "PCM_16", "PCM_24", "PCM_32", "FLOAT", "DOUBLE"}


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
    try:
        info = sf.info(path)
    except (RuntimeError, ValueError) as exc:
        raise ValueError("invalid recording") from exc
    # File extensions and duration alone do not bound decoded audio: compressed
    # containers, excessive channels or extreme sample rates can amplify memory
    # and resampling work. Inspect actual container metadata before any decoder.
    if (
        not isinstance(getattr(info, "format", None), str)
        or info.format not in WAV_FORMATS
        or not isinstance(getattr(info, "subtype", None), str)
        or info.subtype not in PCM_SUBTYPES
        or type(getattr(info, "channels", None)) is not int
        or not 1 <= info.channels <= 2
        or type(getattr(info, "samplerate", None)) is not int
        or not MIN_SAMPLE_RATE <= info.samplerate <= MAX_SAMPLE_RATE
        or type(getattr(info, "frames", None)) is not int
        or info.frames <= 0
    ):
        raise ValueError("unsupported recording format")
    if info.frames > MAX_AUDIO_SECONDS * info.samplerate:
        raise ValueError("recording exceeds the duration limit")
