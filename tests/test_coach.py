import pytest

from singing_coach import coach


class FakeMessage:
    def __init__(self, text):
        self.content = [FakeBlock(text)]


class FakeBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class FakeMessagesAPI:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeMessage("Lead with breath support. Aim for a steady tone.")


class FakeClient:
    def __init__(self):
        self.messages = FakeMessagesAPI()


@pytest.fixture
def fake_client(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(coach, "_build_client", lambda: client)
    return client


def test_coach_returns_response_text(fake_client):
    result = coach.coach(
        exercise_spec={"type": "scale", "display_name": "5-note scale"},
        measurements={"jitter_local": 0.01, "hnr_mean": 22.0},
        history=[],
    )
    assert result == "Lead with breath support. Aim for a steady tone."


def test_coach_uses_sonnet_4_6(fake_client):
    coach.coach(exercise_spec=None, measurements={"jitter_local": 0.01}, history=[])
    call = fake_client.messages.calls[0]
    assert call["model"] == "claude-sonnet-4-6"


def test_system_prompt_includes_measurement_glossary(fake_client):
    coach.coach(exercise_spec=None, measurements={"jitter_local": 0.01}, history=[])
    call = fake_client.messages.calls[0]
    system = call["system"]
    text = system[0]["text"] if isinstance(system, list) else system
    assert "jitter" in text.lower()
    assert "shimmer" in text.lower()
    assert "hnr" in text.lower()
    assert "vibrato" in text.lower()


def test_system_prompt_uses_prompt_caching(fake_client):
    coach.coach(exercise_spec=None, measurements={"jitter_local": 0.01}, history=[])
    call = fake_client.messages.calls[0]
    system = call["system"]
    assert isinstance(system, list)
    assert system[0].get("cache_control") == {"type": "ephemeral"}


def test_user_message_contains_all_four_blocks_for_exercise(fake_client):
    coach.coach(
        exercise_spec={"type": "scale", "display_name": "5-note scale"},
        measurements={"jitter_local": 0.01, "hnr_mean": 22.0},
        history=[{"measurements": {"jitter_local": 0.02}}],
    )
    call = fake_client.messages.calls[0]
    user_content = call["messages"][0]["content"]
    text = user_content if isinstance(user_content, str) else user_content[0]["text"]
    assert "<exercise>" in text and "</exercise>" in text
    assert "<measurements>" in text and "</measurements>" in text
    assert "<history>" in text and "</history>" in text
    assert "<task>" in text and "</task>" in text


def test_user_message_omits_exercise_block_for_free_sing(fake_client):
    coach.coach(
        exercise_spec=None,
        measurements={"jitter_local": 0.01},
        history=[],
    )
    call = fake_client.messages.calls[0]
    user_content = call["messages"][0]["content"]
    text = user_content if isinstance(user_content, str) else user_content[0]["text"]
    assert "<exercise>" not in text
    assert "<measurements>" in text
    assert "<history>" in text
    assert "<task>" in text


def test_history_block_includes_recent_measurements(fake_client):
    coach.coach(
        exercise_spec=None,
        measurements={"jitter_local": 0.01},
        history=[
            {"measurements": {"jitter_local": 0.02, "hnr_mean": 18.0}},
            {"measurements": {"jitter_local": 0.03, "hnr_mean": 17.5}},
        ],
    )
    call = fake_client.messages.calls[0]
    user_content = call["messages"][0]["content"]
    text = user_content if isinstance(user_content, str) else user_content[0]["text"]
    assert "0.02" in text or "0.03" in text
