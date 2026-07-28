import httpx
import pytest

from singing_coach import coach_ollama, config

SCHEMA = {"type": "object", "properties": {"focus_area": {"type": "string"}}}
PAYLOAD = {"focus_area": "vibrato"}


def _respond(monkeypatch, handler):
    monkeypatch.setattr(coach_ollama.httpx, "post", handler)


def test_generate_returns_parsed_json(monkeypatch):
    captured = {}

    def handler(url, json=None, timeout=None):
        captured["url"] = url
        captured["body"] = json
        return httpx.Response(
            200,
            json={"message": {"content": '{"focus_area": "vibrato"}'}},
            request=httpx.Request("POST", url),
        )

    _respond(monkeypatch, handler)
    assert coach_ollama.generate("system", "user", SCHEMA) == PAYLOAD
    assert captured["url"].endswith("/api/chat")


def test_generate_constrains_output_to_the_schema(monkeypatch):
    captured = {}

    def handler(url, json=None, timeout=None):
        captured.update(json)
        return httpx.Response(
            200,
            json={"message": {"content": '{"focus_area": "vibrato"}'}},
            request=httpx.Request("POST", url),
        )

    _respond(monkeypatch, handler)
    coach_ollama.generate("system", "user", SCHEMA)

    assert captured["format"] == SCHEMA
    assert captured["stream"] is False
    assert captured["messages"][0]["role"] == "system"
    assert captured["messages"][1]["content"] == "user"


def test_generate_uses_the_configured_model(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_OLLAMA_MODEL", "qwen2.5:3b")
    captured = {}

    def handler(url, json=None, timeout=None):
        captured.update(json)
        return httpx.Response(
            200,
            json={"message": {"content": "{}"}},
            request=httpx.Request("POST", url),
        )

    _respond(monkeypatch, handler)
    coach_ollama.generate("system", "user", SCHEMA)
    assert captured["model"] == "qwen2.5:3b"


def test_generate_reports_an_unreachable_server(monkeypatch):
    def handler(url, json=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    _respond(monkeypatch, handler)
    with pytest.raises(coach_ollama.LocalCoachError):
        coach_ollama.generate("system", "user", SCHEMA)


def test_generate_explains_how_to_pull_a_missing_model(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_OLLAMA_MODEL", "not-pulled")

    def handler(url, json=None, timeout=None):
        return httpx.Response(404, text="model not found", request=httpx.Request("POST", url))

    _respond(monkeypatch, handler)
    with pytest.raises(coach_ollama.LocalCoachError) as excinfo:
        coach_ollama.generate("system", "user", SCHEMA)
    assert "ollama pull not-pulled" in str(excinfo.value)


def test_generate_rejects_unparseable_output(monkeypatch):
    def handler(url, json=None, timeout=None):
        return httpx.Response(
            200,
            json={"message": {"content": "I'm afraid I can't do that"}},
            request=httpx.Request("POST", url),
        )

    _respond(monkeypatch, handler)
    with pytest.raises(coach_ollama.LocalCoachError):
        coach_ollama.generate("system", "user", SCHEMA)


def test_generate_rejects_an_empty_response(monkeypatch):
    def handler(url, json=None, timeout=None):
        return httpx.Response(
            200,
            json={"message": {"content": "   "}},
            request=httpx.Request("POST", url),
        )

    _respond(monkeypatch, handler)
    with pytest.raises(coach_ollama.LocalCoachError):
        coach_ollama.generate("system", "user", SCHEMA)


def _tags(monkeypatch, handler):
    monkeypatch.setattr(coach_ollama.httpx, "get", handler)


def test_installed_models_is_empty_when_the_server_is_down(monkeypatch):
    def handler(url, timeout=None):
        raise httpx.ConnectError("refused")

    _tags(monkeypatch, handler)
    assert coach_ollama.installed_models() == []


def test_availability_reports_a_missing_server(monkeypatch):
    monkeypatch.setattr(coach_ollama, "installed_models", lambda: [])
    ready, message = coach_ollama.availability()
    assert ready is False
    assert config.DEFAULT_OLLAMA_HOST in message


def test_availability_names_alternatives_when_the_model_is_absent(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_OLLAMA_MODEL", "missing:1b")
    monkeypatch.setattr(coach_ollama, "installed_models", lambda: ["llama3.2:3b"])
    ready, message = coach_ollama.availability()
    assert ready is False
    assert "llama3.2:3b" in message


def test_availability_is_ready_when_the_model_is_present(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_OLLAMA_MODEL", "llama3.2:3b")
    monkeypatch.setattr(coach_ollama, "installed_models", lambda: ["llama3.2:3b"])
    ready, message = coach_ollama.availability()
    assert ready is True
    assert "llama3.2:3b" in message


def test_installed_models_reads_the_tags_endpoint(monkeypatch):
    def handler(url, timeout=None):
        return httpx.Response(
            200,
            json={"models": [{"name": "llama3.2:3b"}, {"name": "qwen2.5:3b"}]},
            request=httpx.Request("GET", url),
        )

    _tags(monkeypatch, handler)
    assert coach_ollama.installed_models() == ["llama3.2:3b", "qwen2.5:3b"]
