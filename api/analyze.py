"""Vercel Python function: analyze one recording from Supabase Storage.

POST /api/analyze
  { "storage_key": "<uid>/<uuid>.wav",
    "exercise_spec": {...} | null,
    "mode": "full" | "pitch_only" }

Returns { measurements, contour, pitch_median_midi }. The contour is what the
pitch chart draws; Measurements alone carries only scalars.
"""

import json
import os
import re
import sys
import tempfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import _librosa_stubs

_librosa_stubs.install()

import httpx
import jwt
import numpy as np
import torch

torch.set_num_threads(1)

from singing_coach import accuracy, audio_io, pitch, voice_qa
from singing_coach.models import ExerciseSpec

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "recordings"
MAX_AUDIO_BYTES = 25 * 1024 * 1024

# The function reads Storage with the service role, so this check replaces RLS.
# One filename segment under the caller's own uid - no dots, no slashes, no
# traversal - matching exactly what the Recorder uploads.
OBJECT_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+\.wav$")


def _storage_key_owned_by(storage_key: str, uid: str) -> bool:
    prefix, _, name = storage_key.partition("/")
    return prefix == uid and bool(OBJECT_NAME_RE.fullmatch(name))

_jwks_client = None


def _verify_jwt(auth_header: str | None) -> str:
    """Verify the Supabase access token and return the user id (sub)."""
    global _jwks_client
    if not auth_header or not auth_header.startswith("Bearer "):
        raise PermissionError("missing bearer token")
    token = auth_header.removeprefix("Bearer ")
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        )
    key = _jwks_client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token, key.key, algorithms=["ES256"], audience="authenticated"
    )
    return claims["sub"]


def _download(storage_key: str, dest: Path) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_key}"
    with httpx.Client(timeout=60) as client:
        with client.stream(
            "GET", url, headers={"Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
        ) as response:
            if response.status_code == 404:
                raise FileNotFoundError(storage_key)
            response.raise_for_status()
            written = 0
            with dest.open("wb") as f:
                for chunk in response.iter_bytes():
                    written += len(chunk)
                    if written > MAX_AUDIO_BYTES:
                        raise ValueError("recording exceeds the size limit")
                    f.write(chunk)


def _round(values: np.ndarray, digits: int) -> list:
    return [round(float(v), digits) for v in values]


def run_analysis(body: dict, spec: ExerciseSpec | None) -> dict:
    storage_key = body["storage_key"]
    mode = body.get("mode", "full")

    fd, tmp_name = tempfile.mkstemp(suffix=".wav", dir="/tmp")
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        _download(storage_key, tmp_path)
        audio, sr = audio_io.load(tmp_path)
        times, f0, confidence = pitch.predict(audio, sr)

        stable = pitch.stable_pitches(f0, confidence)
        pitch_median_midi = (
            float(np.median([pitch.hz_to_midi(h) for h in stable]))
            if stable.size
            else None
        )

        measurements = None
        if mode != "pitch_only":
            result = voice_qa.analyze(tmp_path, contour=(times, f0, confidence))
            if spec is not None:
                result.accuracy = accuracy.score(spec, times, f0, confidence)
            measurements = json.loads(result.model_dump_json())

        voiced = (confidence >= accuracy.MIN_CONFIDENCE) & (f0 > 0)
        f0_midi = np.where(voiced, pitch.hz_to_midi(np.maximum(f0, 1e-6)), np.nan)
        return {
            "measurements": measurements,
            "pitch_median_midi": pitch_median_midi,
            "contour": {
                "times": _round(times, 3),
                "f0_midi": [None if np.isnan(v) else round(float(v), 3) for v in f0_midi],
                "confidence": _round(confidence, 3),
            },
        }
    finally:
        tmp_path.unlink(missing_ok=True)


class handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._reply(400, {"error": "invalid JSON body"})
            return

        try:
            uid = _verify_jwt(self.headers.get("Authorization"))
        except Exception:
            self._reply(401, {"error": "invalid or missing token"})
            return

        storage_key = body.get("storage_key", "")
        if not isinstance(storage_key, str) or not _storage_key_owned_by(
            storage_key, uid
        ):
            self._reply(403, {"error": "storage key not owned by caller"})
            return

        spec_json = body.get("exercise_spec")
        try:
            spec = ExerciseSpec(**spec_json) if spec_json else None
        except (TypeError, ValueError):
            self._reply(400, {"error": "invalid exercise_spec"})
            return

        try:
            self._reply(200, run_analysis(body, spec))
        except FileNotFoundError:
            self._reply(404, {"error": "recording not found"})
        except ValueError:
            self._reply(413, {"error": "recording exceeds the size limit"})
        except Exception as exc:
            self._reply(500, {"error": f"{type(exc).__name__} during analysis"})
