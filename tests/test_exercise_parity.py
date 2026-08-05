"""The committed parity fixture pins exercise selection; lib/exercises.test.ts
asserts the TypeScript port against the same file.
"""

import json
from pathlib import Path

import pytest

from singing_coach import exercises
from singing_coach.models import Calibration

CASES = json.loads(
    (Path(__file__).parent / "fixtures" / "exercise_parity.json").read_text()
)


@pytest.mark.parametrize("case", CASES)
def test_next_exercise_matches_fixture(case):
    spec = exercises.next_exercise(
        Calibration(**case["calibration"]),
        session_index=case["session_index"],
        focus_area=case["focus_area"],
    )
    assert json.loads(spec.model_dump_json()) == case["expected"]
