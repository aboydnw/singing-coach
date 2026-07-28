"""Typed data models shared across the analysis and coaching pipeline."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel


class Calibration(BaseModel):
    """The user's vocal range and comfortable singing zone, in MIDI note numbers."""

    range_low_midi: int
    range_high_midi: int
    tessitura_low_midi: int | None = None
    tessitura_high_midi: int | None = None


class ExerciseSpec(BaseModel):
    """A generated vocal exercise: what to sing and how long each note lasts."""

    type: Literal["sustained", "scale", "arpeggio", "siren"]
    target_notes_midi: list[int]
    duration_per_note_s: float
    vowel: str
    display_name: str


class NoteAccuracy(BaseModel):
    """How far off target one note of the exercise was, in cents."""

    target_midi: int
    target_name: str
    cents_off: float | None


class PitchAccuracy(BaseModel):
    """Per-note and overall pitch accuracy against the exercise's target notes."""

    per_note: list[NoteAccuracy]
    mean_abs_cents_off: float | None


class Measurements(BaseModel):
    """Voice-quality measurements for one recording. NaN values are stored as None."""

    jitter_local: float | None = None
    shimmer_local: float | None = None
    hnr_mean: float | None = None
    vibrato_rate_hz: float | None = None
    vibrato_extent_cents: float | None = None
    f1_mean: float | None = None
    f2_mean: float | None = None
    accuracy: PitchAccuracy | None = None


class FocusArea(str, Enum):
    """The vocal skill the coach wants the user to work on next."""

    breath_support = "breath_support"
    pitch_accuracy = "pitch_accuracy"
    vibrato = "vibrato"
    tone_quality = "tone_quality"
    range = "range"
    agility = "agility"


class CoachingResult(BaseModel):
    """Structured coaching feedback returned by the LLM."""

    focus_area: FocusArea
    top_issue: str
    why: str
    drill: str
    encouragement: str

    def to_markdown(self) -> str:
        return (
            f"### 🎯 {self.top_issue}\n\n"
            f"{self.why}\n\n"
            f"**Try this:** {self.drill}\n\n"
            f"_{self.encouragement}_"
        )
