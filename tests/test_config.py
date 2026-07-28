import stat
from pathlib import Path

import pytest

from singing_coach import config


@pytest.fixture
def isolated_paths(tmp_path, monkeypatch):
    user_dir = tmp_path / "user_home"
    user_dir.mkdir()
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    monkeypatch.setattr(config, "USER_CONFIG_DIR", user_dir)
    monkeypatch.setattr(config, "USER_CONFIG_FILE", user_dir / ".env")
    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    return {"user_dir": user_dir, "project_dir": project_dir}


def test_load_api_key_from_process_env(isolated_paths, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-from-env")
    assert config.load_api_key() == "sk-from-env"


def test_load_api_key_from_project_dotenv(isolated_paths):
    (isolated_paths["project_dir"] / ".env").write_text("ANTHROPIC_API_KEY=sk-from-project\n")
    assert config.load_api_key() == "sk-from-project"


def test_load_api_key_from_user_dotenv(isolated_paths):
    (isolated_paths["user_dir"] / ".env").write_text("ANTHROPIC_API_KEY=sk-from-user\n")
    assert config.load_api_key() == "sk-from-user"


def test_process_env_beats_project_dotenv(isolated_paths, monkeypatch):
    (isolated_paths["project_dir"] / ".env").write_text("ANTHROPIC_API_KEY=sk-project\n")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-process")
    assert config.load_api_key() == "sk-process"


def test_project_dotenv_beats_user_dotenv(isolated_paths):
    (isolated_paths["project_dir"] / ".env").write_text("ANTHROPIC_API_KEY=sk-project\n")
    (isolated_paths["user_dir"] / ".env").write_text("ANTHROPIC_API_KEY=sk-user\n")
    assert config.load_api_key() == "sk-project"


def test_load_api_key_raises_when_missing(isolated_paths):
    with pytest.raises(config.MissingApiKeyError):
        config.load_api_key()


def test_save_api_key_creates_user_dir_and_file(isolated_paths):
    user_dir = isolated_paths["user_dir"] / "nested"
    user_file = user_dir / ".env"
    # point at a not-yet-created directory to verify mkdir happens
    import singing_coach.config as cfg
    cfg.USER_CONFIG_DIR = user_dir
    cfg.USER_CONFIG_FILE = user_file

    config.save_api_key("sk-saved")

    assert user_file.exists()
    contents = user_file.read_text()
    assert "ANTHROPIC_API_KEY=sk-saved" in contents


def test_save_api_key_sets_mode_0600(isolated_paths):
    config.save_api_key("sk-secret")
    file_mode = stat.S_IMODE(Path(config.USER_CONFIG_FILE).stat().st_mode)
    assert file_mode == 0o600


def test_save_then_load_round_trip(isolated_paths):
    config.save_api_key("sk-round-trip")
    assert config.load_api_key() == "sk-round-trip"


def test_coach_model_defaults(monkeypatch):
    monkeypatch.delenv("SINGING_COACH_MODEL", raising=False)
    assert config.coach_model() == config.DEFAULT_COACH_MODEL


def test_coach_model_env_override(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_MODEL", "claude-custom")
    assert config.coach_model() == "claude-custom"


def test_coach_max_tokens_env_override(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_MAX_TOKENS", "2048")
    assert config.coach_max_tokens() == 2048


def test_coach_timeout_env_override(monkeypatch):
    monkeypatch.setenv("SINGING_COACH_TIMEOUT_S", "15.5")
    assert config.coach_timeout_s() == 15.5


COACH_SETTINGS = [
    (config.COACH_MODEL_VAR, "claude-from-file", "claude-from-file", config.coach_model),
    (config.COACH_MAX_TOKENS_VAR, "4096", 4096, config.coach_max_tokens),
    (config.COACH_TIMEOUT_VAR, "12.5", 12.5, config.coach_timeout_s),
    (config.OLLAMA_HOST_VAR, "http://box:11434", "http://box:11434", config.ollama_host),
    (config.OLLAMA_MODEL_VAR, "gemma4:e4b", "gemma4:e4b", config.ollama_model),
    (config.OLLAMA_TIMEOUT_VAR, "900", 900.0, config.ollama_timeout_s),
]


@pytest.mark.parametrize("var,raw,expected,read", COACH_SETTINGS)
def test_coach_settings_resolve_from_the_user_dotenv(
    isolated_paths, monkeypatch, var, raw, expected, read
):
    monkeypatch.delenv(var, raising=False)
    (isolated_paths["user_dir"] / ".env").write_text(f"{var}={raw}\n")

    assert read() == expected


@pytest.mark.parametrize("var,raw,expected,read", COACH_SETTINGS)
def test_process_env_beats_the_dotenv_for_coach_settings(
    isolated_paths, monkeypatch, var, raw, expected, read
):
    (isolated_paths["user_dir"] / ".env").write_text(f"{var}=ignored-value\n")
    monkeypatch.setenv(var, raw)

    assert read() == expected


def test_ollama_model_falls_back_to_the_default(isolated_paths, monkeypatch):
    monkeypatch.delenv(config.OLLAMA_MODEL_VAR, raising=False)
    assert config.ollama_model() == config.DEFAULT_OLLAMA_MODEL


def test_ollama_host_from_project_dotenv(isolated_paths, monkeypatch):
    monkeypatch.delenv(config.OLLAMA_HOST_VAR, raising=False)
    (isolated_paths["project_dir"] / ".env").write_text(
        f"{config.OLLAMA_HOST_VAR}=http://gpu-box:11434/\n"
    )
    assert config.ollama_host() == "http://gpu-box:11434"


def test_backend_defaults_to_local(isolated_paths, monkeypatch):
    monkeypatch.delenv(config.BACKEND_VAR, raising=False)
    assert config.coach_backend() == config.OLLAMA_BACKEND
    assert config.uses_anthropic() is False


def test_backend_from_user_dotenv(isolated_paths, monkeypatch):
    monkeypatch.delenv(config.BACKEND_VAR, raising=False)
    (isolated_paths["user_dir"] / ".env").write_text(
        f"{config.BACKEND_VAR}=Anthropic\n"
    )
    assert config.coach_backend() == config.ANTHROPIC_BACKEND
    assert config.uses_anthropic() is True


def test_save_api_key_preserves_other_settings(isolated_paths):
    config.save_supabase_credentials("https://x.supabase.co", "anon-key")
    config.save_api_key("sk-new")

    assert config.load_api_key() == "sk-new"
    assert config.supabase_credentials() == ("https://x.supabase.co", "anon-key")


def test_supabase_credentials_need_both_halves(isolated_paths):
    config.save_settings({config.SUPABASE_URL_VAR: "https://x.supabase.co"})
    assert config.supabase_credentials() is None
