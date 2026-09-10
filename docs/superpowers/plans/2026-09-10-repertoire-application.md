# Repertoire Application Implementation Plan

**Goal:** Let the coach move from varied technical work into recognizable, short
public-domain song passages that fit the singer's range, with immediate key comfort
adjustments and a guided Free Sing fallback.

**Architecture:** Add a versioned repertoire catalog containing editorial melody
excerpts and rights provenance. Resolve the same relative timed-score format into the
existing analysis contract. A pure lesson-stage helper chooses song application after
technical work; the UI only consumes a resolved proposal and shifts among its safe
pre-rendering offsets.

## Task 1: Define and validate repertoire

- Add optional activity kind, source provenance, focus goals, and transposition to the
  stored exercise contract without breaking historical rows.
- Add twelve passages, each under thirty seconds, with recognizable lyrics, verified
  pre-1931 or traditional source metadata, meaningful goal mappings, and timed notes.
- Validate IDs, durations, goals, rights notes, and seven intended render offsets.

## Task 2: Resolve songs into the singer's range

- Resolve each passage at `[-6, -4, -2, 0, 2, 4, 6]`, rejecting out-of-range keys.
- Choose the eligible song and key closest to the singer's tessitura center while
  penalizing recently used passages.
- Expose pure one-step higher/lower adjustment with clear boundary behavior.

## Task 3: Add the technical-to-song lesson transition

- Add a bounded lesson-stage helper: begin with technical work, offer at most one
  focused retry, and propose a song application after two completed technical
  exercises when a matching passage is safe.
- Fall back to another technical activity or guided Free Sing if no song fits.
- Store song attempts through the existing immutable exercise specification.

## Task 4: Expose song and comfort controls

- Show song title, passage instructions, lyric, and primary cue in setup.
- Add `Too high` and `Too low` for transposable proposals; preserve Hear and Record.
- Keep guided Free Sing coach-selectable and accurately describe its unscored nature.

## Task 5: Verify

- Run focused tests, the complete frontend suite, formatting and design checks,
  production build, Storybook build, the activity-audio gate, and focused Python model
  tests. Document any optional Python dependency limitation separately.
