from pathlib import Path

import pytest


@pytest.fixture
def tmp_audio_dir(tmp_path: Path) -> Path:
    d = tmp_path / "audio"
    d.mkdir()
    return d
