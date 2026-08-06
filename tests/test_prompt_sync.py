"""prompts/coaching.json is the single source of truth for the coaching prompt
and schema, and prompts/pedagogy.json for the states and drills the model may
choose. These tests pin both to the Python side; schema.test.ts and
pedagogy.test.ts pin the zod and TypeScript mirrors to the same files.
"""

import json
from pathlib import Path

from singing_coach import resynth
from singing_coach.models import FocusArea

PROMPTS = Path(__file__).parents[1] / "prompts"

COACHING = json.loads((PROMPTS / "coaching.json").read_text())
PEDAGOGY = json.loads((PROMPTS / "pedagogy.json").read_text())

STATES = PEDAGOGY["states"]
DRILLS = [drill for state in STATES for drill in state["drills"]]


def test_focus_area_enum_matches_models():
    assert COACHING["schema"]["properties"]["focus_area"]["enum"] == [
        f.value for f in FocusArea
    ]


def test_schema_requires_every_field():
    assert set(COACHING["schema"]["required"]) == set(
        COACHING["schema"]["properties"].keys()
    )


def test_schema_asks_for_a_state_and_a_drill():
    assert "state_id" in COACHING["schema"]["properties"]
    assert "drill_id" in COACHING["schema"]["properties"]


def test_state_ids_are_unique():
    ids = [state["id"] for state in STATES]
    assert len(set(ids)) == len(ids)


def test_drill_ids_are_globally_unique():
    ids = [drill["id"] for drill in DRILLS]
    assert len(set(ids)) == len(ids)


def test_every_state_has_drills_and_cues():
    for state in STATES:
        assert state["drills"]
        assert state["cues"]


def test_every_state_carries_the_keys_the_route_reads():
    required = {
        "id",
        "display_name",
        "plain_language_description",
        "remediation_family",
        "audible_correction",
        "metric_signature",
        "drills",
        "cues",
        "caution",
        "sources",
    }
    for state in STATES:
        assert required <= set(state.keys())


def test_every_drill_carries_the_keys_the_ui_renders():
    for drill in DRILLS:
        assert {"id", "name", "instructions", "duration_s"} <= set(drill.keys())


def test_named_corrections_are_implemented_by_resynth():
    for state in STATES:
        correction = state["audible_correction"]
        if correction is None:
            continue
        assert correction in resynth.CORRECTIONS


def test_every_state_cites_a_source():
    for state in STATES:
        assert state["sources"]
