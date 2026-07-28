"""Prompt eval harness for the coaching call.

Each case plants a specific vocal problem in the measurements and checks that the
coach's structured focus_area lands on it. Run manually (costs a few API calls):

    uv run python evals/coach_eval.py
"""

import sys

from singing_coach import coach
from singing_coach.models import (
    ExerciseSpec,
    Measurements,
    NoteAccuracy,
    PitchAccuracy,
)

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
    },
    {
        "name": "breathy tone (low HNR)",
        "spec": SUSTAINED_SPEC,
        "measurements": Measurements(**{**HEALTHY, "hnr_mean": 9.0}),
        "expected": {"tone_quality", "breath_support"},
    },
    {
        "name": "consistently flat (accuracy planted at -76 cents)",
        "spec": SCALE_SPEC,
        "measurements": Measurements(**HEALTHY, accuracy=_off_pitch_accuracy()),
        "expected": {"pitch_accuracy"},
    },
    {
        "name": "no vibrato on a sustained note",
        "spec": SUSTAINED_SPEC,
        "measurements": Measurements(
            **{**HEALTHY, "vibrato_rate_hz": 0.0, "vibrato_extent_cents": 0.0}
        ),
        "expected": {"vibrato", "tone_quality"},
    },
]


def main() -> int:
    failures = 0
    for case in CASES:
        result = coach.coach(case["spec"], case["measurements"], history=[])
        ok = result.focus_area.value in case["expected"]
        status = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"[{status}] {case['name']}")
        print(f"        expected one of {sorted(case['expected'])}, got {result.focus_area.value}")
        print(f"        top_issue: {result.top_issue}")
    print(f"\n{len(CASES) - failures}/{len(CASES)} cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
