"""prompts/coaching.json is the single source of truth for the coaching prompt
and schema. These tests pin it to the Python side; schema.test.ts pins the zod
mirror to the same file from TypeScript.
"""

import json
from pathlib import Path

from singing_coach.models import FocusArea

COACHING = json.loads(
    (Path(__file__).parents[1] / "prompts" / "coaching.json").read_text()
)


def test_focus_area_enum_matches_models():
    assert COACHING["schema"]["properties"]["focus_area"]["enum"] == [
        f.value for f in FocusArea
    ]


def test_schema_requires_every_field():
    assert set(COACHING["schema"]["required"]) == set(
        COACHING["schema"]["properties"].keys()
    )
