# Humanized Technical Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent canonical drills as faithful timed vocal activities and play reviewed human-like reference assets with a reliable pitch-reference fallback.

**Architecture:** Add a versioned JSON activity catalog beside the pedagogy catalog. Resolve catalog-relative note events into the existing `ExerciseSpec` boundary for backward-compatible analysis while carrying richer metadata and reference provenance as optional fields. Keep audio selection and fallback behind one playback function so the practice UI does not know which source played.

**Tech Stack:** TypeScript, Zod, React 19, Web Audio, static audio assets, Vitest, existing Next.js and Python analysis boundary.

## Global Constraints

- Existing stored `ExerciseSpec` JSON remains readable.
- A scored activity's target notes and reference audio describe the same transposition.
- Every canonical drill has at least one faithful catalog activity.
- Reference assets require provenance and review status before use.
- Missing or failed vocal audio falls back to labeled simple pitch playback.
- Runtime practice does not require a GPU or network synthesis service.

---

### Task 1: Define the versioned activity contract

**Files:**
- Modify: `lib/schema.ts`
- Modify: `src/singing_coach/models.py`
- Modify: `lib/schema.test.ts`
- Modify: `tests/test_models.py`

**Interfaces:**
- Produces: `activityEventSchema`, `activityMetadataSchema`, and backward-compatible optional fields on `exerciseSpecSchema`.
- Adds optional `activity_id`, `activity_version`, `events`, `instructions`, `primary_cue`, `variety`, and `reference_audio` fields.

- [ ] Write failing TypeScript and Python parsing tests using a note/rest score with unequal durations and one reviewed reference asset.
- [ ] Run `yarn test lib/schema.test.ts` and `python -m pytest tests/test_models.py`; confirm the new fields are rejected or absent.
- [ ] Add discriminated note/rest event models. Note events contain `midi_offset`, `duration_s`, and `syllable`; rest events contain `duration_s`. Reference entries contain `semitones`, `src`, `engine`, `voice`, `license`, and `reviewed`.
- [ ] Preserve the five required legacy fields so old rows and current analysis continue to parse.
- [ ] Run both focused suites and confirm they pass.
- [ ] Commit with `git commit -m "feat: define timed vocal activities"`.

### Task 2: Add and validate the technical activity catalog

**Files:**
- Create: `prompts/activities.json`
- Create: `lib/activityCatalogue.ts`
- Create: `lib/activityCatalogue.test.ts`

**Interfaces:**
- Produces: `ACTIVITIES`, `findActivity(id)`, `activitiesForDrill(drillId)`, and `validateActivityCatalogue()`.
- Consumes: canonical `DRILLS` and `DRILL_IDS` from `lib/pedagogy.ts`.

- [ ] Write failing tests that require unique ID/version pairs, valid positive event durations, at least one activity per canonical drill, matching drill instructions, supported variety attributes, and reviewed/licensed reference metadata for any declared audio.
- [ ] Run `yarn test lib/activityCatalogue.test.ts`; confirm the missing module failure.
- [ ] Add one faithful activity for each of the 21 canonical drills. Encode actual vowels or syllables, melodic direction, rhythmic separation, articulation, duration, and dynamics in metadata and events. Represent the `v/z` ladder and other non-pitched tasks as guided unscored technical activities.
- [ ] Implement Zod-backed loading and cross-catalog validation; throw a message naming the offending activity and field.
- [ ] Run the focused suite and `yarn test lib/pedagogy.test.ts`; confirm both pass.
- [ ] Commit with `git commit -m "feat: add faithful technical activity catalog"`.

### Task 3: Resolve activities safely into a singer's tessitura

**Files:**
- Create: `lib/activityResolver.ts`
- Create: `lib/activityResolver.test.ts`
- Modify: `lib/exerciseSelection.ts`
- Modify: `lib/exerciseSelection.test.ts`

**Interfaces:**
- Produces: `resolveActivity(activity, calibration, semitones): ExerciseSpec | null`.
- Produces: `safeActivityTranspositions(activity, calibration): ResolvedActivity[]`.
- Updates selection to prefer catalog activity IDs and variety attributes before legacy generated candidates.

- [ ] Write failing tests for unequal event timing, range rejection, tessitura safety margin, seven offsets `[-6,-4,-2,0,2,4,6]`, and exact agreement between flattened target notes and note events.
- [ ] Run both focused suites and confirm the resolver is missing.
- [ ] Implement relative-score resolution. Select a base MIDI placement whose note-weighted center is closest to the calibrated tessitura center while every note stays inside tessitura; return null otherwise.
- [ ] Add activity-ID, family, vowel, rhythm, direction, and articulation penalties to recent-history scoring. Keep the legacy generator as fallback for old or incomplete catalog data.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `git commit -m "feat: resolve varied activities for each singer"`.

### Task 4: Add vocal-reference playback with fallback

**Files:**
- Create: `lib/referencePlayback.ts`
- Create: `lib/referencePlayback.test.ts`
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/ExerciseProposal.tsx`
- Modify: `components/practice/ExerciseProposal.test.ts`

**Interfaces:**
- Produces: `playReference(spec): { done: Promise<"vocal" | "pitch_fallback">; stop: () => void }`.
- Consumes reviewed `reference_audio.src`; falls back to `playSequence` using timed events or legacy note timing.

- [ ] Write failing tests proving reviewed audio is attempted, unreviewed audio is ignored, load failure invokes pitch playback, and playback result identifies the source used.
- [ ] Run focused tests and confirm the module is missing.
- [ ] Implement dependency-injected audio creation for deterministic tests. Reject non-root-relative asset paths. Catch media load/play errors and invoke pitch fallback without blocking recording.
- [ ] Replace direct `playSequence` use in `PracticeSession`. Show `Vocal example unavailable—playing pitch guide` only when fallback occurs; clear it on the next successful vocal playback.
- [ ] Run playback and proposal tests and confirm they pass.
- [ ] Commit with `git commit -m "feat: play humanized exercise references"`.

### Task 5: Add the offline rendering manifest and verification gate

**Files:**
- Create: `scripts/check-activity-audio.mjs`
- Modify: `package.json`
- Create: `docs/activity-audio.md`
- Test: `lib/activityCatalogue.test.ts`

**Interfaces:**
- Produces: `yarn activities:check`.
- Requires every declared file to exist, be nonempty, be marked reviewed, and carry engine, voice, and license metadata.

- [ ] Add a failing catalog test referencing a nonexistent reviewed asset and assert the checker reports its activity ID and source path.
- [ ] Run the checker and confirm failure.
- [ ] Implement the checker and document the reproducible authoring fields, review checklist, seven-offset naming convention, and the prohibition on adding an asset before its model and voicebank terms are recorded.
- [ ] Add only assets that have actually been rendered and reviewed; do not create silent or synthetic placeholders.
- [ ] Run `yarn activities:check`, the full test suite, production build, and Storybook build.
- [ ] Commit with `git commit -m "chore: validate activity audio assets"`.
