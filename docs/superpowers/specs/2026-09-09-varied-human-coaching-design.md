# Varied, human coaching design

## Purpose

Make practice feel like a short lesson with a real singing coach rather than a sequence of generic pitch-matching tasks. The coach should vary its material deliberately, demonstrate exercises with a human-like singing voice, and connect technical work to recognizable songs.

Success means a singer can complete several consecutive practices without unexplained repetition, hear a human-like target before recording, and regularly apply technical coaching to recognizable music.

## Current limitations

The current recording generator has four shapes: sustained note, five-note scale, octave arpeggio, and siren. All generated specifications use `ah` and uniform per-note durations. Twenty-one pedagogical drills collapse into these shapes, with eleven mapped to sustained notes and six to sirens. Details such as vowel, articulation, rhythm, dynamics, and the drill's actual instructions are not encoded in the exercise.

Exercise rotation is local to a practice and begins again when a new practice starts. A learning focus can pin every proposal to one shape. The model sees recent drill identifiers but receives no explicit novelty constraint, and a fallback always selects a state's first drill. These behaviors make repetition likely.

Free Sing can be selected by the singer, but the coach cannot prescribe a structured Free Sing task. Reference playback is a browser-generated sine wave. Exercise setup first asks the singer to start the exercise, then reveals another reference button and the recorder, creating a redundant confirmation step.

## Product direction

Use a coach-led lesson arc:

1. Select a current focus from measurements and history.
2. Assign a short technical activity.
3. Offer a focused retry only when comparison would help.
4. Move to a contrasting technical activity before repetition becomes stale.
5. Apply the same idea to a short public-domain song passage.
6. Connect the technical and musical evidence in the resulting feedback.

The sequence is adaptive rather than rigid. The competing approaches—an undirected activity picker and repertoire-first diagnosis—remain possible later, but this approach makes the technical-to-musical connection explicit without asking initial song analysis to carry the whole diagnosis.

## Lesson orchestration

### Lesson stages

A practice has these stages:

- `technical`: establish or refine one measurable skill.
- `technical_retry`: compare a second take while feedback is fresh.
- `song_application`: apply the same coordination to repertoire.
- `reflection`: summarize transfer, progress, and the next direction.

The coach may shorten a stage after a strong result or extend it by one activity when evidence is mixed. A retry must name the comparison purpose. The orchestration must not loop indefinitely: at most one automatic technical retry may follow an attempt, and at most two consecutive activities of the same kind may be proposed unless the singer explicitly asks to repeat.

### Coach authority

The application computes the safe candidate set and ranks it. The coaching model chooses within that set and explains the choice. It cannot invent an activity or bypass range, caution, licensing, or novelty constraints.

If the model omits an identifier, chooses outside the candidate set, or fails, the application uses the highest-ranked safe candidate. The selected activity, selection reason, and whether a fallback was used are stored for later explanation and evaluation.

## Activity catalog

Replace the narrow generated exercise specification with a versioned activity specification. An activity contains:

- A stable identifier, version, and kind: `technical`, `song_passage`, or `guided_free_sing`.
- Display name, concise purpose, instructions, and one primary cue.
- Applicable focus areas and pedagogical states.
- Difficulty, expected duration, required range, and tessitura characteristics.
- Optional register-crossing metadata, cautions, and contraindications.
- Variety attributes: shape, vowel or lyric, rhythm, direction, articulation, dynamics, and remediation family.
- A timed vocal score when the activity has targets.
- Reference-audio variants and their provenance.

### Timed vocal score

A scored activity uses ordered events rather than one shared duration for every MIDI note. Events support pitched notes, rests, lyric syllables, vowel or phoneme hints, articulation, and optional dynamic targets. Absolute placement is derived from a base score plus the chosen transposition.

The same resolved score drives reference playback, display, pitch and rhythm alignment, progress visualization, and analysis. A stored attempt retains the resolved score and catalog version so later catalog edits cannot change the meaning of historical results.

### Technical activities

Every existing canonical pedagogical drill receives at least one faithful scored or guided unscored activity. A faithful realization encodes the drill's actual vowel or syllable, rhythm, melodic motion, articulation, duration, and dynamic behavior instead of attaching a new name to a generic `ah` exercise.

The most frequently selected remediation families receive multiple variants first. Variants must create meaningful motor or listening contrast, not cosmetic label changes.

### Song passages

The initial repertoire contains twelve recognizable public-domain passages. Each is one phrase and no longer than thirty seconds. Catalog metadata identifies the public-domain source, the edited excerpt, and any new arrangement decisions.

Each passage maps to one or more technical goals, such as clean onset, legato breath continuity, interval accuracy, vowel consistency, register crossing, sustained tone, or vibrato steadiness. A passage is eligible only when its musical demand genuinely exercises the current goal.

### Guided Free Sing

Guided Free Sing is a coach-selectable activity with a stable prompt and coaching goal but no target score. Examples include singing a familiar phrase while preserving vowel color or choosing a passage with one sustained note. Pitch accuracy against target notes is unavailable and must not be implied. Other supported measurements and qualitative comparisons remain available.

## Variety and selection

### Cross-practice memory

Selection considers attempts across recent practices, not only the current attempt count. History tracks:

- Activity and catalog-version identifiers.
- Activity kind, pedagogical state, shape, and remediation family.
- Vowel, lyric, rhythm, melodic direction, articulation, and dynamic pattern.
- Starting pitch, tessitura band, and transposition.
- Whether repetition was automatic, coach-justified, or singer-requested.

### Eligibility and ranking

An activity is eligible when it supports the current focus or planned application, fits the calibrated tessitura with a safety margin, violates no coaching caution, uses supported analysis, and has valid audio and rights metadata. Controlled range expansion uses separate explicit safety rules.

Eligible candidates receive deterministic scores for:

- Relevance to the current focus and diagnostic state.
- Expected information gain or practice benefit.
- Novelty across recent activity IDs and variety attributes.
- Contrast with the immediately preceding activity.
- Suitability for the current lesson stage.
- Appropriate difficulty based on recent results.
- Fit within the singer's comfortable tessitura.

Hard recent exclusions prevent immediate accidental repeats. A longer-term diversity penalty makes frequently used shapes and families less likely. The system balances opportunity over time; it does not choose unsuitable material merely to maximize novelty.

An intentional repeat is allowed when the singer asks for it or the coach marks it as a focused comparison or continuation and supplies a specific reason. Repetition for comparison remains in the same exercise thread.

## Human-like reference audio

### Rendering approach

Use an open-source singing-synthesis workflow. OpenUtau may be used to audition singers and author initial material; production assets should be reproducibly rendered with a suitably licensed DiffSinger-compatible engine, voicebank, and vocoder. Engine, model, voicebank, dataset, and generated-output terms must be reviewed independently before an asset enters the catalog.

Render and review assets before deployment rather than synthesizing them during a practice. This avoids a runtime GPU dependency and makes playback fast and predictable.

### Transpositions

Song passages have seven pre-rendered transpositions centered on the editorial base key: `-6`, `-4`, `-2`, `0`, `+2`, `+4`, and `+6` semitones. Adjacent-octave placement may be used where it remains natural for the generated singer. The nearest stored rendering is at most one semitone from an ideal chromatic transposition within the covered span.

The selector first fits the whole passage inside the calibrated range, then prefers a comfortable tessitura with headroom above and below. It considers both extremes and where most notes lie.

The setup offers `Too high` and `Too low`. Either moves one stored transposition in the requested direction, records the adjustment as comfort evidence, and keeps recording available. At a catalog boundary, the unavailable direction is disabled and explained.

Scored technical activities use the same seven offsets. Unscored technical activities do not require transposed audio. The resolved reference and target score must always agree.

### Playback fallback

If a human-like reference cannot load, the activity remains available when its score can be rendered as simple pitch references. The interface reports that the vocal example is unavailable and labels the substitute accurately. Guided Free Sing needs no reference unless its catalog entry provides one.

## Exercise setup interaction

Remove the separate acceptance step. Opening a proposal immediately shows:

- Activity title, purpose, instructions, and primary cue.
- `Hear example` when a reference exists.
- `Record`.
- `Different exercise`.
- `Free sing` for a scored proposal, or `Coach's exercise` for Free Sing.
- `Too high` and `Too low` for transposable material.
- `Cancel` when setup was opened from an existing exercise thread.

The singer may replay the example as often as needed and may record immediately. Starting a recording constitutes acceptance and persists the resolved proposal. Loading reference audio never blocks recording. Existing safeguards continue to prevent navigation or competing mutations while recording, analysis, or proposal generation is active.

## Data flow and boundaries

1. The lesson orchestrator determines the next stage.
2. The catalog service resolves activities applicable to that stage and focus.
3. The range resolver finds safe transpositions.
4. The diversity service applies recent exclusions and scores novelty.
5. The ranking service combines pedagogical relevance, difficulty, range fit, and diversity.
6. The coach receives a compact list of top candidates and selects one with a reason.
7. The proposal stores the selected catalog version, resolved score, transposition, reason, and fallback status.
8. The singer listens, adjusts the key if needed, and records without a separate acceptance action.
9. Analysis uses the resolved score or guided Free Sing contract.
10. Coaching updates lesson state and selection history.

Keep catalog parsing, range resolution, diversity scoring, lesson transitions, and model-choice validation as separate pure or narrowly stateful units. The practice UI consumes a resolved proposal and does not reproduce selection rules.

## Failure behavior

- Missing calibration permits guided Free Sing but blocks range-dependent material with the existing calibration guidance.
- No eligible technical activity yields a clear recovery error rather than an unsafe fallback.
- No eligible song yields guided Free Sing or another technical activity.
- Missing or invalid model output uses the highest-ranked candidate and records the fallback.
- Missing vocal audio uses a labeled pitch-reference fallback when a score exists.
- Failed key adjustment preserves the current proposal and recording controls.
- A removed catalog entry does not break historical attempts because attempts retain their resolved score and catalog version.

## Delivery increments

### 1. Variety and direct recording

- Add cross-practice selection history and intentional-repeat rules.
- Add attribute-level diversity scoring.
- Correctly represent existing drill instructions in selection metadata.
- Remove the redundant start confirmation.
- Show example playback and recording immediately.

### 2. Humanized technical activities

- Add the versioned activity catalog and timed score.
- Give every existing pedagogical drill at least one faithful realization.
- Add variants to heavily used drill families.
- Add pre-rendered generated vocal references and playback fallback.

### 3. Repertoire application

- Add twelve curated public-domain passages.
- Render seven transpositions per passage.
- Add comfort adjustments and store their evidence.
- Make guided Free Sing coach-selectable.
- Enable the technical-to-song lesson arc and transfer feedback.

Each increment is independently usable and preserves existing recorded practices.

## Validation

### Automated checks

- Unit-test range fitting, safety margins, transposition boundaries, novelty scores, recent exclusions, intentional repeats, candidate validation, and lesson transitions.
- Validate unique catalog IDs and versions, valid event timing, supported activity kinds, required metadata, rights provenance, reference availability, and agreement between each audio asset and resolved score.
- Verify that every canonical drill has a faithful activity and every song supports its stated technical goals.
- Test that `Record` and `Hear example` are immediately available without an acceptance click.
- Test `Too high` and `Too low`, including catalog boundaries and preserved recording availability.
- Run end-to-end simulations across several practices and assert diversity at both activity-ID and attribute levels.
- Add coach evaluations that penalize unexplained repetition, reject candidates outside the supplied set, and verify technical-to-song relevance.

### Editorial checks

- A qualified reviewer listens to every generated vocal asset before publication.
- Reviewers confirm intelligible lyrics, correct notes and rhythm, natural enough pronunciation and phrasing, absence of artifacts that would teach a bad target, and consistency with the stored score.
- Every repertoire item and voice asset has documented provenance and acceptable distribution terms.

## Deferred work

- On-demand singing synthesis and runtime GPU infrastructure.
- Arbitrary user-uploaded commercial songs or automatic song ingestion.
- Accompaniment tracks.
- Repertoire-first diagnosis as the default lesson mode.
- Training or cloning a custom singer voice.
- Full expressive-performance scoring beyond measurements the analyzer supports reliably.
