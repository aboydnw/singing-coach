"""Per-note pitch accuracy: how many cents off each target note the singer was.

Signed cents: negative is flat, positive is sharp.
"""

import numpy as np

from singing_coach import pitch
from singing_coach.models import ExerciseSpec, NoteAccuracy, PitchAccuracy

MIN_CONFIDENCE = 0.5
MIN_FRAMES_PER_NOTE = 3


def score(
    spec: ExerciseSpec,
    times: np.ndarray,
    f0: np.ndarray,
    confidence: np.ndarray,
) -> PitchAccuracy | None:
    """Map the voiced portion of the recording onto the exercise's note grid.

    The recording rarely lines up exactly with the reference timing, so the
    voiced span (first to last confident frame) is divided proportionally into
    one segment per target note, and each segment's median pitch is compared
    against its target.
    """
    voiced = (confidence >= MIN_CONFIDENCE) & (f0 > 0)
    n_notes = len(spec.target_notes_midi)
    if n_notes == 0 or voiced.sum() < MIN_FRAMES_PER_NOTE * n_notes:
        return None

    voiced_idx = np.nonzero(voiced)[0]
    start_t = times[voiced_idx[0]]
    end_t = times[voiced_idx[-1]]
    span = end_t - start_t
    if span <= 0:
        return None

    per_note: list[NoteAccuracy] = []
    abs_offsets: list[float] = []
    for i, target_midi in enumerate(spec.target_notes_midi):
        seg_start = start_t + span * i / n_notes
        seg_end = start_t + span * (i + 1) / n_notes
        in_segment = voiced & (times >= seg_start) & (times <= seg_end)
        cents_off = None
        if in_segment.sum() >= MIN_FRAMES_PER_NOTE:
            median_hz = float(np.median(f0[in_segment]))
            cents_off = round(
                float(pitch.cents_off_target(median_hz, pitch.midi_to_hz(target_midi))),
                1,
            )
            abs_offsets.append(abs(cents_off))
        per_note.append(
            NoteAccuracy(
                target_midi=target_midi,
                target_name=pitch.midi_to_name(target_midi),
                cents_off=cents_off,
            )
        )

    mean_abs = round(float(np.mean(abs_offsets)), 1) if abs_offsets else None
    return PitchAccuracy(per_note=per_note, mean_abs_cents_off=mean_abs)
