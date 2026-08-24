# Attempt-threaded practice design

## Purpose

Make a practice session read like a set of focused conversations instead of one long mixed timeline. Each recorded attempt owns its feedback and coach conversation. The session-wide Practice Compass stays visible but becomes short enough to understand without page-level scrolling.

## Goals

- Let the singer select any recorded attempt and see only that attempt's analysis and conversation.
- Keep attempt feedback, follow-up questions, and coach replies in one natural reading order.
- Put retry and exercise-changing actions at the end of the active attempt thread.
- Let the singer start exercise setup from the attempt navigator without creating an empty attempt.
- Reduce the Practice Compass to an overall trend, a current-session observation, and a next direction.
- Preserve existing practice sessions and messages during the data-model change.

## Non-goals

- Multiple conversations for one attempt.
- Branching or renaming attempt threads.
- Replacing the existing attempt analysis, recorder, coaching, or session-ending flows.
- Changing how exercises are scored or how canonical drills are selected.

## Information architecture

### Wide layouts

The practice workspace uses three columns:

1. **Attempt navigator:** a narrow sticky left column.
2. **Active thread:** the flexible center column and primary reading surface.
3. **Practice Compass:** a compact sticky right column.

The page header and session-level notices remain above the workspace. The center column is the only column that contains attempt detail, conversation, recording setup, or thread actions.

### Narrow layouts

The attempt navigator becomes a compact attempt selector above the active thread. It must preserve the selected-attempt label, expose all attempts with keyboard and touch controls, and keep the New attempt action available. The Compass follows the active thread in normal document flow and does not use sticky positioning.

## Attempt navigator

Attempts appear in ascending sequence order so their numbers remain stable. Each item shows:

- `Attempt N` or `Focused retry N`;
- the exercise display name, falling back to `Free sing`;
- one short outcome derived from stored coaching or measurements;
- an active state using more than color alone.

Selecting an item updates the center thread without navigating away from the practice URL. On first load, the latest attempt is selected. After a successful recording, the new attempt is appended and selected. A failed or unsaved recording must not add a normal navigator item; the existing partial-save notice and recoverable result remain in the center.

The New attempt button opens the next exercise setup in the center. It does not create a draft item or database row. If recording or analysis is already in progress, it is disabled. Starting setup does not discard the currently selected attempt or its messages; canceling or choosing another attempt returns to that thread.

## Active attempt thread

The center column renders this order:

1. the selected `AttemptResult` summary and expandable full analysis;
2. that attempt's persisted user and assistant messages in chronological order;
3. a streaming assistant response, when present;
4. the inline question composer;
5. the thread action row: Try again and Try a different exercise;
6. exercise proposal and recording controls when an action has opened setup.

Questions created from an attempt's coaching, measurement, drill, or Compass context remain in the selected attempt thread. The context anchor still identifies the immutable source being discussed; the attempt reference identifies the thread that owns the conversation.

Try again prepares a retry proposal whose `parent_attempt_id` is the selected attempt. Try a different exercise prepares an initial proposal with no parent. A completed recording creates the next sequence-numbered attempt and makes it active. The proposal and recorder reuse the existing confirmation, processing, calibration, free-sing, partial-save, and error behavior.

Before the first recording, the center contains only the initial exercise setup. There is no chat composer because no attempt thread exists yet. Ended practices keep the navigator and all attempt threads readable but show no composer, proposal, retry, different-exercise, or New attempt controls.

## Conversation ownership and storage

Add nullable `attempt_id` to `practice_messages`, referencing `sessions(id)` with `on delete cascade`; a conversation has no valid thread once its owning attempt is deleted. Add an index supporting `(practice_session_id, attempt_id, created_at)` reads.

New user and assistant messages must always include the selected attempt ID. The client sends both `practice_session_id` and `attempt_id`; the server verifies that the attempt belongs to that practice before accepting the request. Assistant rows inherit the same attempt ID. Chat history supplied to the model contains only recent messages from that attempt, while the model may still receive the session Compass and measurement summaries for all attempts as background.

Existing messages are backfilled deterministically:

1. If a message's context anchor `sourceId` matches an attempt in the same practice, assign that attempt.
2. Otherwise assign the most recent attempt in the same practice whose timestamp is not later than the message.
3. If the practice has attempts but none precedes the message, assign the earliest attempt.
4. If a legacy practice has no attempts, leave the message unassigned and preserve it in storage; the normal attempt-thread UI does not invent an attempt for it.

The nullable column permits safe migration of the final legacy edge case, but application writes require a valid attempt. Row-level security continues to use message ownership; server validation enforces the cross-table practice relationship.

## Practice Compass

Replace the current five-field presentation with three short fields:

- **Overall trend:** what repeated evidence across recent practice sessions suggests.
- **This session:** what the attempts in the current practice show so far.
- **Next direction:** the single most useful direction to carry into the next attempt.

Each field is one plain-language sentence, with a target maximum of 140 characters and a hard schema maximum of 180 characters. The Compass shows no repeated drill steps, measurement glossary, long rationale, strength section, readiness checklist, or confidence badge. Each field retains an Explain action that anchors a question to the selected attempt thread. Before enough history exists, Overall trend explicitly says the coach is still learning the singer's normal pattern rather than presenting a diagnosis.

The structured coaching prompt and response schema gain a dedicated `compass` object with `overall_trend`, `current_session`, and `next_direction` instead of reusing the long attempt-feedback fields. The prompt instructs the model to:

- compare the current measurement with recent cross-session history;
- distinguish the cross-session trend from the current practice evidence;
- use one sentence per Compass field;
- avoid drill instructions and unexplained measurement jargon;
- make Next direction a direction, not a multi-step exercise.

The coaching request includes the current practice ID, and each history entry includes its practice ID, so the model can distinguish attempts in this practice from earlier practices. The learning contract retains its existing internal focus fields for exercise selection and adds the latest `compass` object. Existing learning contracts without that object receive a compact fallback from their stored focus, strength, and readiness fields, then gain model-produced Compass content after the next successfully coached attempt.

## State and data flow

`PracticeSession` owns `selectedAttemptId` and proposal mode. It initializes selection to the latest loaded attempt, preserves a still-valid selection across refreshes, and selects a newly saved attempt. The selected attempt determines the rendered `AttemptResult`, filtered messages, chat request attempt ID, contextual question destination, and retry parent.

The session bundle may continue loading all attempts and messages in one request at the current scale, but messages are grouped by `attempt_id` before rendering. The chat API independently filters model conversation history by attempt ID. This keeps presentation efficient without introducing a new thread entity.

## Accessibility and interaction details

- The desktop navigator uses semantic navigation with an accessible label.
- Attempt controls expose the selected state with `aria-current` or `aria-selected` as appropriate.
- Focus moves to the active-thread heading after a deliberate attempt selection, but not during initial hydration.
- Opening exercise setup moves focus to its heading.
- The inline composer retains Enter-to-send, Shift+Enter for a new line, visible focus, streaming stop, disabled, and anchored-context states.
- All controls remain reachable and understandable without hover or color.
- Long attempt names and outcomes wrap without widening the navigator.

## Errors and recovery

- If an attempt referenced by the URL state or local selection no longer exists, select the latest available attempt.
- If the chat API receives an attempt from another practice, return a validation error and create no message.
- If sending or streaming fails, keep the user's message and the recoverable partial assistant content in that attempt thread under existing status behavior.
- If the Compass payload is missing or from an older contract, show a compact fallback derived from the existing focus and coaching data rather than failing the practice screen.
- Existing partial-save and coaching-retry paths remain visible inside the active center column.

## Testing strategy

### Unit and component tests

- Message grouping assigns messages only to their stored attempt ID.
- Legacy backfill follows explicit anchor, preceding attempt, earliest attempt, and no-attempt rules.
- Navigator selection changes the visible analysis and conversation.
- Latest attempt is selected initially; a newly saved attempt becomes selected.
- New attempt opens setup without adding a navigator item.
- Try again uses the selected attempt as parent; different exercise uses no parent.
- Ended practice hides all mutation controls while preserving navigation.
- Compass renders exactly three concise fields and anchors Explain actions correctly.
- Old learning-contract data normalizes to a readable compact Compass.
- Mobile attempt selector exposes the same attempts and active state.

### API and schema tests

- User and assistant messages persist the requested attempt ID.
- An attempt from another practice is rejected before message insertion.
- Model history includes only the selected attempt's messages.
- Coaching structured output requires all three Compass fields and enforces length limits.
- The database migration adds the foreign key and read index and preserves legacy rows.

### Regression verification

Run formatting, design-token checks, unit tests, the production build, Storybook build, and database migration checks. Manually verify an active multi-attempt practice, a first-attempt empty state, a narrow viewport, an ended practice, and a legacy practice with previously session-wide messages.

## Acceptance criteria

- Selecting an attempt shows only that attempt's analysis and chat.
- A question sent while an attempt is selected reappears only in that attempt's thread after refresh.
- Try again and Try a different exercise appear at the end of the thread, not in a fixed page-wide composer.
- New attempt opens setup without creating an empty attempt, and a successful recording adds and selects the real attempt.
- The Compass contains only Overall trend, This session, and Next direction, with no page-level scrolling needed to read it at a typical desktop viewport.
- The Compass describes evidence across practices separately from evidence in the current practice.
- Existing attempts, contextual anchors, and messages belonging to practices with attempts remain accessible after migration. Messages from a legacy practice with no attempts remain preserved in storage without an invented thread.
