"""Resynthesise a take with one flaw corrected, in the singer's own voice.

Singing technique is an auditory-motor skill. A sentence like "steady your
breath" has to be translated by the singer into a muscular guess; hearing their
own voice do the thing correctly does not. This module produces that target.

The mechanism is Praat's PSOLA, reached through parselmouth: analyse the take
into a Manipulation object, replace its pitch tier with a corrected one, and
overlap-add it back. PSOLA reshapes timing and pitch while leaving the singer's
timbre alone, which is exactly what makes the result still sound like them.

Deliberately NOT here: breathiness correction. PSOLA reshapes periodicity, not
the noise floor, so reducing breathiness needs spectral subtraction on the
aperiodic component - a different and much larger project. Where a clear-tone
exemplar is wanted, use a past take of the singer's that already scored well.

This module never imports the measurement pipeline. The numbers the app reports
must not be able to change because something in here changed.
"""

from pathlib import Path

import numpy as np
import parselmouth
from parselmouth.praat import call

PITCH_FLOOR_HZ = 75.0
PITCH_CEILING_HZ = 600.0
TIME_STEP_S = 0.01

HEALTHY_VIBRATO_RATE_HZ = 5.5
HEALTHY_VIBRATO_EXTENT_CENTS = 50.0

STEADY_PITCH = "steady_pitch"
HEALTHY_VIBRATO = "healthy_vibrato"
CORRECTIONS = (STEADY_PITCH, HEALTHY_VIBRATO)


class NotEnoughPitch(Exception):
    """The take has too little voiced audio to resynthesise meaningfully."""


def load(path: Path) -> parselmouth.Sound:
    return parselmouth.Sound(str(path))


def save(sound: parselmouth.Sound, path: Path) -> None:
    sound.save(str(path), parselmouth.SoundFileFormat.WAV)


def correct(sound: parselmouth.Sound, correction: str) -> parselmouth.Sound:
    """Apply a named correction. The caller picks which; this module owns how."""
    if correction == STEADY_PITCH:
        return steady_pitch(sound)
    if correction == HEALTHY_VIBRATO:
        return healthy_vibrato(sound)
    raise ValueError(f"unknown correction '{correction}'")


def steady_pitch(sound: parselmouth.Sound) -> parselmouth.Sound:
    """Hold the take at one pitch: its own median.

    This is the exemplar for a singer whose note sags or wanders. Flattening to
    the median rather than to the exercise's target note is deliberate - the
    point being demonstrated is steadiness, and retuning the note at the same
    time would demonstrate two things at once.
    """
    return _replace_contour(sound, lambda _t, median: median)


def healthy_vibrato(
    sound: parselmouth.Sound,
    rate_hz: float = HEALTHY_VIBRATO_RATE_HZ,
    extent_cents: float = HEALTHY_VIBRATO_EXTENT_CENTS,
) -> parselmouth.Sound:
    """Put an even vibrato on the take, around its own median pitch.

    extent_cents is the peak deviation, so the swing is twice this wide. The
    defaults sit in the middle of the range that reads as natural in both
    classical and contemporary singing.
    """

    def value(t: float, median: float) -> float:
        cents = extent_cents * np.sin(2.0 * np.pi * rate_hz * t)
        return median * (2.0 ** (cents / 1200.0))

    return _replace_contour(sound, value)


def _replace_contour(sound: parselmouth.Sound, value_at) -> parselmouth.Sound:
    """Swap the take's pitch tier for one built by value_at(time, median).

    The replacement tier reuses the original tier's time points rather than a
    fresh grid: those are where Praat found periodicity, so keeping them means
    the resynthesis stays aligned with the singer's actual phonation instead of
    inventing pitch during silences.
    """
    manipulation = call(
        sound, "To Manipulation", TIME_STEP_S, PITCH_FLOOR_HZ, PITCH_CEILING_HZ
    )
    original = call(manipulation, "Extract pitch tier")
    n_points = int(call(original, "Get number of points"))
    if n_points < 2:
        raise NotEnoughPitch("fewer than two pitch points in this take")

    times = [call(original, "Get time from index", i + 1) for i in range(n_points)]
    values = [call(original, "Get value at index", i + 1) for i in range(n_points)]
    finite = [v for v in values if np.isfinite(v) and v > 0]
    if not finite:
        raise NotEnoughPitch("no finite pitch values in this take")
    median = float(np.median(finite))

    corrected = call("Create PitchTier", "corrected", sound.xmin, sound.xmax)
    for t in times:
        call(corrected, "Add point", t, float(value_at(t, median)))

    call([manipulation, corrected], "Replace pitch tier")
    return call(manipulation, "Get resynthesis (overlap-add)")
