"""Vercel Python function: resynthesise one recording with a flaw corrected.

POST /api/resynth
  { "storage_key": "<uid>/<uuid>.wav", "correction": "steady_pitch" }

Returns { "storage_key": "<uid>/<uuid>-<correction>.wav" }, which the browser
turns into a signed URL the same way it does for the original recording.

The corrected clip is written back to the singer's own Storage prefix rather
than streamed in the response: Vercel caps a response body at 4.5 MB, and a
long take at 48 kHz will pass that.
"""

import json
import os
import re
import sys
import tempfile
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import httpx
import jwt

from singing_coach import resynth

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "recordings"
MAX_AUDIO_BYTES = 25 * 1024 * 1024

# The request body is a storage key and a correction name, so a few kilobytes is
# generous. Capping the declared Content-Length keeps an unauthenticated caller
# from making the function allocate whatever it claims to be sending.
MAX_BODY_BYTES = 16 * 1024

OBJECT_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+\.wav$")

_jwks_client = None


def _storage_key_owned_by(storage_key: str, uid: str) -> bool:
    prefix, _, name = storage_key.partition("/")
    return prefix == uid and bool(OBJECT_NAME_RE.fullmatch(name))


def _verify_jwt(auth_header: str | None) -> str:
    global _jwks_client
    if not auth_header or not auth_header.startswith("Bearer "):
        raise PermissionError("missing bearer token")
    token = auth_header.removeprefix("Bearer ")
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    key = _jwks_client.get_signing_key_from_jwt(token)
    claims = jwt.decode(token, key.key, algorithms=["ES256"], audience="authenticated")
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


def _upload(source: Path, storage_key: str) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_key}"
    with httpx.Client(timeout=60) as client:
        response = client.post(
            url,
            content=source.read_bytes(),
            headers={
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                "Content-Type": "audio/wav",
                "x-upsert": "true",
            },
        )
        response.raise_for_status()


def run_resynth(storage_key: str, correction: str, uid: str) -> dict:
    fd, src_name = tempfile.mkstemp(suffix=".wav", dir="/tmp")
    os.close(fd)
    fd, out_name = tempfile.mkstemp(suffix=".wav", dir="/tmp")
    os.close(fd)
    src, out = Path(src_name), Path(out_name)
    try:
        _download(storage_key, src)
        resynth.save(resynth.correct(resynth.load(src), correction), out)
        corrected_key = f"{uid}/{uuid.uuid4()}-{correction.replace('_', '-')}.wav"
        _upload(out, corrected_key)
        return {"storage_key": corrected_key}
    finally:
        src.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


class handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        # Identity first: nothing below should run, or allocate, for a caller
        # who has not proved who they are.
        try:
            uid = _verify_jwt(self.headers.get("Authorization"))
        except Exception:
            self._reply(401, {"error": "invalid or missing token"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY_BYTES:
                self._reply(413, {"error": "request body too large"})
                return
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._reply(400, {"error": "invalid JSON body"})
            return

        storage_key = body.get("storage_key", "")
        if not isinstance(storage_key, str) or not _storage_key_owned_by(
            storage_key, uid
        ):
            self._reply(403, {"error": "storage key not owned by caller"})
            return

        correction = body.get("correction", "")
        if correction not in resynth.CORRECTIONS:
            self._reply(400, {"error": "unknown correction"})
            return

        try:
            self._reply(200, run_resynth(storage_key, correction, uid))
        except FileNotFoundError:
            self._reply(404, {"error": "recording not found"})
        except resynth.NotEnoughPitch:
            self._reply(
                422, {"error": "not enough steady pitch in this take to rebuild it"}
            )
        except ValueError as error:
            self._reply(400, {"error": str(error)})
        except Exception:
            self._reply(500, {"error": "resynthesis failed"})
