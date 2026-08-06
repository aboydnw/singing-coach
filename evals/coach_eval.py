"""Prompt eval harness for the coaching call.

Each case plants a specific vocal problem in the measurements and checks that
the coach's structured focus_area AND its diagnostic state_id land on it. The
state check is the stronger of the two: it is a closed-set classification into
prompts/pedagogy.json, so a miss is unambiguous rather than a judgement about
prose. The harness also counts fallbacks - a resolved.used_fallback means the
model named a state or drill that does not exist, which is a prompt bug even
when the focus area happened to be right. Calls the real TS route over
HTTP so the eval exercises the code path users hit. The route requires a
signed-in user, so provide account credentials plus the Supabase project:

    EVAL_EMAIL=... EVAL_PASSWORD=... \
    NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
    uv run python evals/coach_eval.py [base_url]

base_url defaults to a local `yarn dev`; pass the production URL to eval the
deployed route.
"""

import json
import os
import sys
import urllib.parse

import httpx

from singing_coach.models import (
    ExerciseSpec,
    Measurements,
    NoteAccuracy,
    PitchAccuracy,
)

DEFAULT_BASE_URL = "http://localhost:3000"

SCALE_SPEC = ExerciseSpec(
    type="scale",
    target_notes_midi=[60, 62, 64, 65, 67],
    duration_per_note_s=0.5,
    vowel="ah",
    display_name="scale on 'ah', starting C4",
)

SUSTAINED_SPEC = ExerciseSpec(
    type="sustained",
    target_notes_midi=[62],
    duration_per_note_s=3.0,
    vowel="ah",
    display_name="sustained on 'ah', starting D4",
)

HEALTHY = dict(
    jitter_local=0.006,
    shimmer_local=0.03,
    hnr_mean=24.0,
    vibrato_rate_hz=5.6,
    vibrato_extent_cents=60.0,
    f1_mean=700.0,
    f2_mean=1200.0,
)


def _off_pitch_accuracy() -> PitchAccuracy:
    per_note = [
        NoteAccuracy(target_midi=m, target_name=n, cents_off=c)
        for m, n, c in [
            (60, "C4", -65.0),
            (62, "D4", -80.0),
            (64, "E4", -70.0),
            (65, "F4", -90.0),
            (67, "G4", -75.0),
        ]
    ]
    return PitchAccuracy(per_note=per_note, mean_abs_cents_off=76.0)


CASES = [
    {
        "name": "shaky breath (high jitter, high shimmer)",
        "spec": SUSTAINED_SPEC,
        "measurements": Measurements(**{**HEALTHY, "jitter_local": 0.045, "shimmer_local": 0.14}),
        "expected": {"breath_support"},
        "expected_states": {"breath_support_deficit"},
    },
    {
        "name": "breathy tone (low HNR)",
        "spec": SUSTAINED_SPEC,
        "measurements": Measurements(**{**HEALTHY, "hnr_mean": 9.0}),
        "expected": {"tone_quality", "breath_support"},
        "expected_states": {"hypoadduction", "breath_support_deficit"},
    },
    {
        "name": "consistently flat (accuracy planted at -76 cents)",
        "spec": SCALE_SPEC,
        "measurements": Measurements(**HEALTHY, accuracy=_off_pitch_accuracy()),
        "expected": {"pitch_accuracy"},
        "expected_states": {
            "breath_support_deficit",
            "registration_instability",
            "vowel_placement",
        },
    },
    {
        "name": "no vibrato on a sustained note",
        "spec": SUSTAINED_SPEC,
        "measurements": Measurements(
            **{**HEALTHY, "vibrato_rate_hz": 0.0, "vibrato_extent_cents": 0.0}
        ),
        "expected": {"vibrato", "tone_quality"},
        "expected_states": {"vibrato_absent", "vibrato_irregular"},
    },
]


def _env(*names: str) -> str:
    """First set variable among names, with all whitespace stripped - long keys
    pasted into a terminal often pick up a line break mid-value."""
    for name in names:
        value = os.environ.get(name)
        if value:
            return "".join(value.split())
    raise KeyError(names[0])


def _require_https_for_remote(url: str) -> str:
    """Credentials and tokens travel over these URLs, so plain http is only
    acceptable when it never leaves the machine."""
    parsed = urllib.parse.urlparse(url)
    loopback = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme != "https" and not loopback:
        raise SystemExit(f"refusing to send credentials over {url!r}; use https")
    return url


def _access_token() -> str:
    supabase_url = _require_https_for_remote(
        _env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").rstrip("/")
    )
    anon_key = _env("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
    response = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": anon_key},
        json={
            "email": _env("EVAL_EMAIL"),
            "password": os.environ["EVAL_PASSWORD"].strip(" \t\r\n"),
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def _call_route(
    base_url: str, token: str, spec: ExerciseSpec, measurements: Measurements
) -> dict:
    response = httpx.post(
        f"{base_url}/api/coach",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "exercise_spec": json.loads(spec.model_dump_json()),
            "measurements": json.loads(measurements.model_dump_json()),
            "history": [],
        },
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


def main() -> int:
    base_url = _require_https_for_remote(
        sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    )
    token = _access_token()
    failures = 0
    fallbacks = 0
    for case in CASES:
        result = _call_route(base_url, token, case["spec"], case["measurements"])
        resolved = result.get("resolved", {})
        focus_ok = result["focus_area"] in case["expected"]
        state_ok = result.get("state_id") in case["expected_states"]
        ok = focus_ok and state_ok
        if not ok:
            failures += 1
        if resolved.get("used_fallback"):
            fallbacks += 1
        print(f"[{'PASS' if ok else 'FAIL'}] {case['name']}")
        print(
            f"        focus:  expected one of {sorted(case['expected'])}, "
            f"got {result['focus_area']}"
        )
        print(
            f"        state:  expected one of {sorted(case['expected_states'])}, "
            f"got {result.get('state_id')}"
        )
        print(f"        drill:  {resolved.get('drill', {}).get('id')}")
        if resolved.get("used_fallback"):
            print("        NOTE:   the model named an id outside the asset")
        print(f"        top_issue: {result['top_issue']}")
    print(f"\n{len(CASES) - failures}/{len(CASES)} cases passed")
    if fallbacks:
        print(f"{fallbacks}/{len(CASES)} cases needed the signature fallback")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
