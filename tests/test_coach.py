import pytest

from singing_coach import coach, coach_ollama, config
from singing_coach.models import CoachingResult, ExerciseSpec, Measurements

COACHING_INPUT = {
    "focus_area": "breath_support",
    "top_issue": "Steady the airflow",
    "why": "Jitter is elevated.",
    "drill": "Hiss for 20 seconds on a steady breath.",
    "encouragement": "Great tone clarity.",
}


class FakeMessage:
    def __init__(self, tool_input):
        self.content = [FakeToolBlock(tool_input)]


class FakeToolBlock:
    def __init__(self, tool_input):
        self.type = "tool_use"
        self.name = "give_coaching"
        self.input = tool_input


class FakeMessagesAPI:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeMessage(COACHING_INPUT)


class FakeClient:
    def __init__(self):
        self.messages = FakeMessagesAPI()


@pytest.fixture
def fake_client(monkeypatch):
    client = FakeClient()
    monkeypatch.setenv(config.BACKEND_VAR, config.ANTHROPIC_BACKEND)
    monkeypatch.setattr(coach, "_build_client", lambda: client)
    return client


SCALE_SPEC = ExerciseSpec(
    type="scale",
    target_notes_midi=[60, 62, 64, 65, 67],
    duration_per_note_s=0.5,
    vowel="ah",
    display_name="scale on 'ah', starting C4",
)

MEASUREMENTS = Measurements(jitter_local=0.01, hnr_mean=22.0)


def _user_text(call):
    user_content = call["messages"][0]["content"]
    return user_content if isinstance(user_content, str) else user_content[0]["text"]


def test_coach_returns_structured_result(fake_client):
    result = coach.coach(exercise_spec=SCALE_SPEC, measurements=MEASUREMENTS, history=[])
    assert isinstance(result, CoachingResult)
    assert result.focus_area.value == "breath_support"
    assert result.top_issue == "Steady the airflow"


def test_coach_forces_the_coaching_tool(fake_client):
    coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    call = fake_client.messages.calls[0]
    assert call["tool_choice"] == {"type": "tool", "name": "give_coaching"}
    assert call["tools"][0]["name"] == "give_coaching"


def test_coach_uses_configured_model(fake_client, monkeypatch):
    monkeypatch.setenv("SINGING_COACH_MODEL", "claude-test-model")
    coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    call = fake_client.messages.calls[0]
    assert call["model"] == "claude-test-model"


def test_system_prompt_includes_measurement_glossary(fake_client):
    coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    call = fake_client.messages.calls[0]
    system = call["system"]
    text = system[0]["text"] if isinstance(system, list) else system
    assert "jitter" in text.lower()
    assert "shimmer" in text.lower()
    assert "hnr" in text.lower()
    assert "vibrato" in text.lower()
    assert "cents_off" in text.lower()


def test_system_prompt_uses_prompt_caching(fake_client):
    coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    call = fake_client.messages.calls[0]
    system = call["system"]
    assert isinstance(system, list)
    assert system[0].get("cache_control") == {"type": "ephemeral"}


def test_user_message_contains_all_four_blocks_for_exercise(fake_client):
    coach.coach(
        exercise_spec=SCALE_SPEC,
        measurements=MEASUREMENTS,
        history=[{"measurements": Measurements(jitter_local=0.02)}],
    )
    text = _user_text(fake_client.messages.calls[0])
    assert "<exercise>" in text and "</exercise>" in text
    assert "<measurements>" in text and "</measurements>" in text
    assert "<history>" in text and "</history>" in text
    assert "<task>" in text and "</task>" in text


def test_user_message_omits_exercise_block_for_free_sing(fake_client):
    coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    text = _user_text(fake_client.messages.calls[0])
    assert "<exercise>" not in text
    assert "<measurements>" in text


def test_history_includes_prior_advice_and_context(fake_client):
    prior = CoachingResult.model_validate(COACHING_INPUT)
    coach.coach(
        exercise_spec=None,
        measurements=MEASUREMENTS,
        history=[
            {
                "ts": "2026-07-27T10:00:00+00:00",
                "exercise_type": "scale",
                "measurements": Measurements(jitter_local=0.02, hnr_mean=18.0),
                "coaching": prior,
            }
        ],
    )
    text = _user_text(fake_client.messages.calls[0])
    assert "2026-07-27" in text
    assert "scale" in text
    assert "Steady the airflow" in text
    assert "0.02" in text


def test_raises_when_no_tool_output(fake_client, monkeypatch):
    class EmptyMessage:
        content = []

    monkeypatch.setattr(
        fake_client.messages, "create", lambda **kwargs: EmptyMessage()
    )
    with pytest.raises(RuntimeError):
        coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])


def test_coaching_tool_and_local_format_share_one_schema():
    assert coach.COACHING_TOOL["input_schema"] is coach.COACHING_SCHEMA


def test_coach_defaults_to_the_local_backend(monkeypatch):
    monkeypatch.delenv(config.BACKEND_VAR, raising=False)
    monkeypatch.setattr(config, "setting", lambda name: None)
    calls = {}

    def fake_generate(system_prompt, user_message, schema):
        calls["schema"] = schema
        calls["system"] = system_prompt
        return COACHING_INPUT

    monkeypatch.setattr(coach_ollama, "generate", fake_generate)
    result = coach.coach(exercise_spec=SCALE_SPEC, measurements=MEASUREMENTS, history=[])

    assert isinstance(result, CoachingResult)
    assert calls["schema"] is coach.COACHING_SCHEMA
    assert "jitter" in calls["system"].lower()


def test_coach_routes_to_ollama_when_configured(monkeypatch):
    monkeypatch.setenv(config.BACKEND_VAR, config.OLLAMA_BACKEND)
    monkeypatch.setattr(
        coach_ollama, "generate", lambda system, user, schema: COACHING_INPUT
    )
    result = coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
    assert result.focus_area.value == "breath_support"


def test_coach_rejects_an_unknown_backend(monkeypatch):
    monkeypatch.setenv(config.BACKEND_VAR, "gpt-at-home")
    with pytest.raises(RuntimeError):
        coach.coach(exercise_spec=None, measurements=MEASUREMENTS, history=[])
