from singing_coach.models import ExerciseSpec


def test_exercise_spec_accepts_timed_activity_metadata():
    spec = ExerciseSpec(
        type="scale",
        target_notes_midi=[60, 62],
        duration_per_note_s=0.5,
        vowel="hey",
        display_name="Staccato hey",
        activity_id="staccato_onsets.basic",
        activity_version=1,
        instructions="Sing two separated hey sounds.",
        primary_cue="Flick each sound toward the far wall.",
        events=[
            {"kind": "note", "midi": 60, "duration_s": 0.25, "syllable": "hey"},
            {"kind": "rest", "duration_s": 0.25},
            {"kind": "note", "midi": 62, "duration_s": 0.5, "syllable": "hey"},
        ],
        variety={
            "shape": "two-note",
            "rhythm": "separated",
            "direction": "ascending",
            "articulation": "staccato",
            "dynamics": "even",
        },
        reference_audio=[
            {
                "semitones": 0,
                "src": "/audio/activities/staccato-onsets-0.wav",
                "engine": "DiffSinger",
                "model": "acoustic-v1",
                "voicebank": "licensed-demo",
                "dataset": "documented-dataset",
                "output_license": "CC-BY-4.0",
                "reviewed": True,
            }
        ],
    )

    assert spec.events is not None
    assert spec.events[1].kind == "rest"
    assert spec.reference_audio is not None
    assert spec.reference_audio[0].reviewed is True


def test_exercise_spec_keeps_legacy_payloads_readable():
    spec = ExerciseSpec(
        type="sustained",
        target_notes_midi=[60],
        duration_per_note_s=3,
        vowel="ah",
        display_name="Sustained ah",
    )

    assert spec.activity_id is None


def test_exercise_spec_accepts_public_domain_song_provenance():
    spec = ExerciseSpec(
        type="scale",
        target_notes_midi=[60, 64, 67],
        duration_per_note_s=0.5,
        vowel="lyrics",
        display_name="Amazing Grace",
        activity_kind="song_passage",
        activity_id="amazing_grace.opening",
        activity_version=1,
        excerpt="Amazing grace, how sweet the sound",
        focus_areas=["breath_support", "pitch_accuracy"],
        transposition_semitones=0,
        source={
            "work": "Amazing Grace",
            "publication_year": 1779,
            "public_domain_basis": "Published in the 18th century.",
        },
    )

    assert spec.activity_kind == "song_passage"
    assert spec.source is not None
    assert spec.source.publication_year == 1779
