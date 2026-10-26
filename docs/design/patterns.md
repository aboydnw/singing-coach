# Product patterns

## Attempt lifecycle

`ready → recording → encoding → uploading → queued → analyzing → coaching → completed`

Every async stage is visible in the existing artifact. A failure preserves the last recoverable
state and offers a specific retry. Only one attempt may record or process at a time.

The singer must remain on the page through upload and durable job acknowledgement. After the UI
says “Recording uploaded,” the persisted job—not the browser—owns analysis, coaching, and attempt
creation. Reloading or returning later restores that job. Terminal failure keeps the artifact in
place and retries from its safe checkpoint rather than creating a second attempt.

## Partial save

Analysis is valuable even when persistence fails. Show the result, use `AppNotice` with
`tone="partial"`, explain what will be missing from Progress, and never label the whole attempt a
failure.

## Streaming coaching

The singer's message appears immediately. The assistant response streams in place. During a stream,
the singer may stop generation but may not submit a duplicate request. An interrupted response stays
visible and exposes retry. Structured application actions are never parsed from prose.

## Plasticity Loop

An original attempt, one correction, and its retries form one conceptual unit. Foreground only the
targeted behavior. After two unclear retries, make simplify, change cue, or move on more prominent
than another repetition. Never claim improvement when evidence is insufficient.

## Contextual explanation

Questions may be anchored to coaching text, an exercise instruction, a measurement, or a Compass
field. The visible context label and server payload must refer to the same immutable source. Removing
the chip removes context from the request; it does not delete earlier messages.

## Attempt-owned conversation

The product hierarchy is Practice → Attempts → Attempt detail → Conversation. The practice route
is an action workspace and attempt index, not a chat transcript. Each attempt detail renders only
messages whose `attempt_id` matches that attempt, and every new question persists that ID.

Legacy null-attempt messages remain readable as General practice questions but are not reassigned.
Context anchors may target coaching text, instructions, or measurements inside the displayed
attempt. Try again returns to the practice controls with that owned attempt as the retry parent.

## Action-first practice

An active practice opens ready to repeat the latest exercise: concise progress and focus copy,
reference playback, then recording. Different exercise and End practice stay adjacent. Attempts
are listed newest-first below and link to dedicated review; charts and conversations never push
recording controls down the practice page.

After the controls leave the viewport, Back to practice controls replaces the former Jump to latest
behavior. The attempt detail route instead keeps Back to practice and Try again in sticky context.

## Practice entry

The signed-in practice home presents Continue practice and Start new practice together whenever a
session is active. The resume card shows a short, plain-text coaching cue rather than stored
Markdown or diagnostics. Starting new requires confirmation, saves and ends the active practice
first, and reveals alternate focus choices only on request.

## Proposal and recording

The current proposal appears directly in the action workspace with reference playback and recording;
there is no extra acceptance step. Different exercise stays available before recording.

## Explicit session ending

Leaving or refreshing does not end practice. End is destructive to future editing and requires
confirmation. Completed attempts remain readable. Ended sessions expose no composer, recording, or
retry controls and receive no artificial coach sign-off.

## Loading, empty, and error

- Page loading uses shape-matched skeletons.
- Long-running work names the current stage.
- Empty states explain what will appear and how to create it.
- Errors state what failed, preserve trustworthy results, and expose the narrowest recovery.
- Do not use `window.alert` for product errors.

## Responsive progressive disclosure

Desktop and mobile preserve the same controls-first hierarchy. Full analysis remains collapsed by
default and opens on the attempt detail route.
