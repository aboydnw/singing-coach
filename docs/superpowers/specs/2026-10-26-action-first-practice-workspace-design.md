# Action-first practice workspace design

## Status

Approved in conversation on 2026-10-26. This design supersedes the conversation-first practice-page sections of the durable mobile practice design while preserving its job durability requirements.

## Problem

The practice page currently uses one exercise conversation as its main organizing surface. Recording controls, retry setup, complete attempt analysis, exercise navigation, and coaching chat all compete for the same live edge. A singer must scroll to the bottom to choose Try again, is then moved toward setup elsewhere in the page, and still cannot see the next action immediately when reopening a practice.

The product hierarchy is instead:

`Practice → Attempts → Attempt detail → Conversation about that attempt`

The page should optimize first for making the next attempt. Review and discussion remain available, but they must not displace the listening and recording controls.

## Goals

- Open every active practice on an immediately usable retry workspace.
- Show at most two short statements about the latest relevant attempt before the controls.
- Keep reference playback, recording, different exercise, and end practice together.
- List attempts below the workspace without embedding long conversations into that page.
- Give each attempt a dedicated review route and attempt-owned conversation.
- Replace Jump to latest with Back to practice controls after the workspace leaves the viewport.
- Preserve durable processing, retry recovery, exercise lineage, accessibility, and responsive behavior.

## Non-goals

- Changing analysis, coaching, or Workflow orchestration.
- Adding a database migration or changing message ownership.
- Moving general unanchored messages onto an arbitrary attempt.
- Creating a second retry confirmation before recording.
- Replacing the existing design system or navigation shell.

## Information architecture

### Practice workspace route

`/practice/[practiceId]` is the action and overview route. For an active practice it renders, in order:

1. compact practice status;
2. the action workspace;
3. attempt history;
4. general practice questions, only when unanchored messages exist;
5. supporting practice context.

The route opens at the document top. It never restores a transcript live edge or automatically scrolls to an attempt.

### Attempt detail route

`/practice/[practiceId]/attempt/[attemptId]` is the review and discussion route. It verifies through the loaded practice bundle that the attempt belongs to the practice. A missing or foreign attempt produces the existing branded error surface rather than leaking data.

A sticky contextual bar contains Back to practice and Try again. Try again navigates to `/practice/[practiceId]?retry=<attemptId>#practice-controls`. The workspace validates that ID against the loaded practice, selects its exercise lineage, prepares a retry proposal, and removes the query parameter after consuming it.

## Action workspace

The action workspace is the first substantial surface on an active practice. It has the stable anchor `practice-controls` and owns the current exercise proposal, reference player, recorder, durable job state, and alternative actions.

For a practice with completed attempts, it automatically prepares a retry of the latest attempt in the selected exercise. No Try again button is required. On a normal reopen, the selected exercise is the latest recorded exercise. If a valid retry query is present, that attempt's exercise is selected instead.

The content order is:

- **How it is going:** the latest coaching encouragement, shortened to one sentence.
- **Focus on this:** the latest coaching top issue plus a short cue, shortened to one sentence.
- current exercise name, excerpt, and essential instruction;
- reference playback when the exercise has target notes;
- recorder;
- Different exercise and End practice in one secondary action row.

The two summaries are derived only from stored structured coaching and learning-contract fields. They strip Markdown, collapse whitespace, and cap each statement at 160 characters. Missing content is omitted; a new practice instead explains that the first attempt will establish a focus.

Reference playback stops when recording begins, the proposal changes, or the component unmounts. Different exercise opens the existing proposal-selection flow in the same workspace. End practice retains its confirmation dialog and is disabled while upload or durable processing is active.

When a durable job is queued, analyzing, or coaching, `PendingAttempt` replaces the recorder portion of the workspace. The singer can navigate away after acknowledgement but cannot record another attempt or end the practice. A failed job exposes its retry action in the same location. Completion refreshes the workspace summary and prepares the next retry without scrolling.

## Attempt history

The workspace lists attempts newest-first because this is a record index, not a conversation. Each `AttemptSummaryCard` shows:

- attempt number and exercise name;
- timestamp;
- one short coaching outcome;
- a comparison badge when a meaningful parent comparison exists;
- Review attempt.

Cards link to the attempt detail route. They do not expand charts, the complete analysis, or chat inline. Retry attempts remain individual records while their exercise lineage remains visible in the exercise label and comparison.

## Attempt detail and conversation

The detail page reuses the current assessment presentation: coaching correction, explanation, strength, charts, measurements, drill, and audible correction. Full acoustic analysis may remain collapsed initially on narrow screens.

Below the assessment is **Ask about this attempt**. The composer and messages are filtered strictly by `attempt_id === attempt.id`. Context actions within the correction, measurements, or exercise instructions prefill an immutable context anchor for that same attempt. Submitted messages always persist the route attempt ID.

The composer is revealed on demand so the primary review remains readable. Once opened, it shows prior messages and supports streaming, stop, retry, and errors using the existing chat endpoint. Copy uses “Ask about this attempt” rather than implying a practice-wide chat.

Messages with `attempt_id = null` remain in an optional General practice questions section on the workspace. This section is read-only in this scope; new questions must be attempt-owned.

## Back to practice controls

The conversation viewport and Jump to latest control are removed from the practice workspace. An IntersectionObserver watches the `practice-controls` surface. Once it has scrolled above the viewport, a fixed **Back to practice controls** button appears above the mobile tab bar. Activating it scrolls the workspace into view, focuses its heading, and respects `prefers-reduced-motion`. It disappears while any part of the workspace is meaningfully visible.

The attempt detail route does not use this floating button. Its sticky contextual bar keeps Back to practice and Try again continuously available.

## Responsive layout

On phones, the action workspace is a single vertical flow and fits the essential coaching plus playback/recording actions before history. Secondary actions wrap but remain adjacent. Attempt cards use full-width touch targets.

On desktop, the workspace may use two columns: coaching focus beside exercise controls. Attempt history follows below in the main content column. The information architecture and action order do not change by breakpoint.

The existing mobile application tab bar remains authoritative. Fixed controls reserve its semantic `mobileNav` height and safe-area inset.

## Data flow and state

- `loadPractice(practiceId)` remains the source for the practice, attempts, messages, and jobs.
- Pure helpers derive the latest selectable attempt, exercise lineage, short workspace summaries, and attempt-owned messages.
- The workspace owns proposal generation and durable job submission.
- The attempt detail owns chat streaming for exactly one attempt.
- A retry deep link carries only an attempt UUID; the client derives all exercise and proposal data from the loaded owned attempt.
- No server or database contract changes are required.

## Error and empty states

- A new practice shows the initial exercise proposal and recorder without prior-coaching summaries.
- A practice with no usable structured coaching shows a neutral “Listen for one clear, comfortable change” cue.
- An invalid retry ID is ignored with a visible notice; no foreign data is requested.
- A missing attempt detail shows a practice-scoped not-found notice and Back to practice.
- Active or failed durable jobs retain the existing truthful stages and recovery.
- Ended practices render history and attempt detail as review-only, without controls or Try again.
- General messages remain accessible even if their original attempt anchor is null.

## Accessibility

- `practice-controls` has a programmatically focusable heading.
- Sticky and fixed actions never cover content and have at least 48 CSS-pixel targets.
- Attempt cards are semantic links with descriptive accessible names.
- The detail contextual bar is navigation, not a second application header.
- Streaming messages use the existing polite live region and stop action.
- Reduced-motion preferences disable smooth scrolling.
- Keyboard focus moves only after explicit Back to controls or Try again actions.

## Testing

- Pure summary helpers enforce precedence, sanitization, and length caps.
- Workspace state helpers choose the latest attempt or a valid retry target and reject foreign IDs.
- Static component tests verify the workspace action order, history links, contextual detail navigation, and attempt-specific composer copy.
- Chat filtering tests prove one attempt cannot render another attempt's messages.
- Scroll-controller tests cover visibility and reduced-motion behavior.
- Existing durable job, recorder, reference playback, exercise selection, and database tests remain green.
- Production and Storybook builds validate responsive component integration.
