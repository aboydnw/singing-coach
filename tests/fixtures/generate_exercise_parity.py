"""Regenerate the exercise-selection parity fixture consumed by both pytest
and vitest, so the TypeScript port provably matches the Python original.

    uv run python tests/fixtures/generate_exercise_parity.py
"""

import json
from pathlib import Path

from singing_coach import exercises
from singing_coach.models import Calibration

CALIBRATIONS = [
    {"range_low_midi": 48, "range_high_midi": 72, "tessitura_low_midi": 55, "tessitura_high_midi": 65},
    {"range_low_midi": 40, "range_high_midi": 60, "tessitura_low_midi": 45, "tessitura_high_midi": 55},
    {"range_low_midi": 57, "range_high_midi": 60, "tessitura_low_midi": 57, "tessitura_high_midi": 59},
]

FOCUS_AREAS = [
    None,
    "breath_support",
    "pitch_accuracy",
    "vibrato",
    "tone_quality",
    "range",
    "agility",
]


def main() -> None:
    cases = []
    for calibration in CALIBRATIONS:
        for focus in FOCUS_AREAS:
            for index in range(8):
                spec = exercises.next_exercise(
                    Calibration(**calibration), session_index=index, focus_area=focus
                )
                cases.append(
                    {
                        "calibration": calibration,
                        "session_index": index,
                        "focus_area": focus,
                        "expected": json.loads(spec.model_dump_json()),
                    }
                )
    out = Path(__file__).parent / "exercise_parity.json"
    out.write_text(json.dumps(cases, indent=2) + "\n")
    print(f"wrote {len(cases)} cases to {out}")


if __name__ == "__main__":
    main()
