# Exercise-threaded practice design

## Status

Approved on 2026-08-24. This design supersedes the attempt-level navigation and conversation model in `2026-08-24-attempt-threaded-practice-design.md`. It retains the concise Practice Compass and attempt-scoped storage safeguards from that work.

## Problem

The current Practice workspace treats every recorded attempt as a separate sidebar item and conversation. In actual practice, singers often repeat the same exercise several times while discussing the same coaching idea. Splitting those retries into separate threads makes the sidebar too granular and breaks the continuity of the exercise.

The workspace should organize around exercises. Each exercise thread should contain all recorded attempts of that exercise and all related coaching conversation. Starting a different exercise should create a new thread. Starting the same exercise again through “Try again” should remain in the current thread.

## Chosen approach

Derive exercise threads from the existing attempt retry graph instead of adding another durable database entity.

- A recorded attempt without a valid parent is the root of an exercise thread.
- A retry belongs to the thread of its root ancestor.
- A retry of a retry remains in the same root thread.
- A broken or cyclic parent chain falls back to a standalone thread so no attempt disappears.
- Messages remain stored against the attempt where they were asked and are collected across the attempts in the active exercise thread.
- A new exercise draft exists only in client state. It may be lost on refresh.

This matches the existing data model, avoids another migration and backfill, and preserves the specific attempt that supplied context for each chat message.

## Workspace layout and interaction

### Exercise navigator

Replace the attempt navigator with an exercise navigator.

- The desktop sidebar heading is “Exercises.”
- The mobile selector label is “Exercise.”
- The primary sidebar action is “+ New exercise.”
- Each recorded item represents one root exercise thread.
- Each item shows the exercise name, a compact attempt count, and the latest available outcome.
- Items remain chronological by their root attempt.
- The active item uses the existing selected-state treatment and accessible current-state semantics.

### Exercise thread

Selecting an exercise renders its complete thread in the center column.

- Every attempt card in the exercise appears inline in chronological order.
- Chat messages from every attempt in the exercise appear in the same conversation.
- Attempts and messages are interleaved by timestamp so the thread reads naturally.
- Contextual questions retain their source attempt and anchor even though the conversation is shared by the exercise.
- The composer and exercise actions remain at the bottom of the complete thread.

“Try again” opens recording setup for the current exercise and saves the resulting attempt as a retry of the selected thread’s latest attempt. The new result remains in the same selected exercise.

“Try a different exercise” has the same thread-creation behavior as “New exercise.”

### Draft exercise

Only one unrecorded draft exercise may exist at a time.

- “New exercise” creates and selects a client-only draft when none exists.
- Pressing “New exercise” again while that draft exists selects the existing draft instead of creating or regenerating another one.
- The draft contains the proposed exercise setup but no persisted attempt row.
- Canceling the draft returns to the previously selected recorded exercise.
- Refreshing the page discards the draft and selects the latest recorded exercise.
- A successful first recording replaces the selected draft with the new recorded exercise thread.
- If the first attempt cannot be saved, the draft remains selected and shows the existing unsaved-result recovery.

Ended practices are read-only. They show recorded exercise threads but no draft or mutation controls.

## State and component model

`PracticeSession` replaces `selectedAttemptId` with `selectedExerciseId`.

- A recorded exercise ID is its root attempt ID.
- A draft uses one stable client-only ID for the lifetime of the mounted page.
- `previousRecordedExerciseId` remembers where Cancel should return.
- Refresh preserves a valid recorded exercise selection, selects a newly created root exercise, or falls back to the latest recorded exercise.
- Saving a retry preserves the current root exercise selection.

Replace `AttemptNavigator` with `ExerciseNavigator`. The navigator consumes derived exercise-thread summaries rather than raw attempts.

Pure practice helpers own the derivation rules:

- Resolve a root attempt with cycle and missing-parent protection.
- Group attempts into chronological exercise threads.
- Collect the attempt IDs and messages for one thread.
- Build the interleaved timeline.
- Produce a stable exercise label, count, name, and latest outcome.
- Resolve selection after refresh or successful recording.

The center workspace consumes one active exercise thread and renders its timeline. Attempt cards continue to use persisted sequence numbers and retry labels.

## Conversation and API behavior

Messages remain persisted with `attempt_id`. No schema migration is required.

When a user sends an unanchored question from the exercise composer, it is assigned to the latest recorded attempt in that exercise. Anchored questions use the attempt that supplied the selected feedback.

The chat request continues to send a concrete attempt ID for ownership validation. Its model history expands from one attempt to all attempt IDs in the same exercise retry chain. The server derives and validates that chain within the requested practice before loading history. Attempts from other practices are never included.

The assistant message remains attached to the request attempt, so storage stays precise while rendering and model context operate at exercise scope.

The draft has no chat composer until its first attempt is recorded because there is no durable attempt ID to own a message. Exercise instructions may still be reviewed and changed within setup.

## Loading, cancellation, and errors

- Recording, encoding, upload, chat streaming, and proposal generation disable exercise navigation.
- Recorder teardown continues to stop late microphone streams, abort uploads, and suppress post-disposal callbacks.
- Proposal request tokens prevent canceled or stale generation from reopening a draft.
- Selecting a recorded exercise closes setup and clears draft-only context.
- A missing selected exercise falls back to the latest recorded thread.
- Broken and cyclic parent links produce standalone threads rather than hiding data.
- Failed first-attempt persistence keeps the draft and unsaved result visible.
- Failed retry persistence stays visible in the selected recorded exercise.
- Existing coaching retry and partial-save recovery remain available.

## Accessibility and responsive behavior

- The navigator is labeled “Practice exercises.”
- Recorded exercise controls expose the active state with `aria-current`.
- The mobile selector contains the same recorded exercises plus the active draft when present.
- Focus moves to the selected exercise heading after deliberate selection.
- Opening or returning to a draft moves focus to exercise setup.
- Cancel returns focus to the previously selected recorded exercise when available.
- Long exercise names and outcomes wrap without widening the navigator.
- Disabled controls expose their disabled state instead of silently ignoring input.

## Testing strategy

### Pure grouping and selection

- A root attempt creates one exercise thread.
- Direct retries and retries of retries join the root thread.
- Separate initial attempts create separate threads even when their exercise specs match.
- Missing parents and cycles become safe standalone threads.
- Attempts remain chronological inside each thread.
- Initial selection chooses the latest recorded exercise.
- Refresh preserves a valid selection and discards the client-only draft.
- A new root recording replaces the selected draft.
- A retry recording preserves the selected root exercise.

### Timeline and conversation

- One exercise timeline includes all of its attempts and messages in time order.
- Messages from another exercise never appear.
- Anchored messages retain their source attempt.
- Unanchored exercise questions attach to the latest attempt.
- Chat model history includes all and only the attempts in the validated exercise chain.

### Components and interaction

- The navigator says “Exercises” and “+ New exercise.”
- Exercise rows show name, attempt count, and latest outcome.
- Repeated “New exercise” selects the one existing draft.
- Cancel returns to the previous recorded exercise.
- Successful first recording replaces the draft.
- Try again appends within the current exercise.
- All attempt cards appear inline.
- Mobile selection and ended-practice read-only behavior match desktop.

### Regression verification

Run formatting, design checks, frontend tests, backend tests, production build, Storybook build, migration-history validation, and database schema contracts. Review a multi-attempt exercise, two separate exercises with matching specs, a draft exercise, a narrow viewport, and an ended practice.

## Acceptance criteria

- The sidebar and mobile selector organize recorded work by exercise rather than by attempt.
- Every retry of an exercise appears inline in the same selected thread.
- Chat messages across those attempts appear in one chronological exercise conversation.
- “Try again” adds to the current exercise thread.
- “New exercise” and “Try a different exercise” select one client-only draft thread.
- Repeating “New exercise” before recording returns to that draft without creating or regenerating another.
- Cancel returns to the prior recorded exercise, and refresh safely discards the draft.
- The first successfully saved draft attempt replaces the draft with a recorded exercise thread.
- Existing attempt ownership, cross-practice security, concise Compass behavior, recorder cancellation, and ended-practice immutability continue to work.
