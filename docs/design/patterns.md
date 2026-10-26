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

## Exercise-owned conversation

Each exercise thread owns one chronological coach conversation and contains every recorded retry
of that exercise inline. Messages retain the concrete attempt that supplied their context, while
unanchored questions attach to the latest attempt in the selected exercise. Try again appends to the
current exercise; Try a different exercise starts or returns to the one temporary draft.

Exercise setup is preparation, not a recorded attempt. One client-only draft may appear in the
navigator until its first recording is saved. Reopening New exercise selects that draft without
regenerating its proposal, Cancel returns to the prior recorded exercise, and a successful first
recording replaces the draft with its recorded exercise thread.

## Conversation live edge

Conversation order stays oldest-to-newest. When the singer is near the live edge, new coaching
keeps the newest content visible. When they have scrolled up, incoming content does not move the
viewport; a “Jump to latest” control reports unseen updates. Recording and retry actions remain in
the mobile sticky dock at the live edge rather than being duplicated inside old messages.

## Practice entry

The signed-in practice home presents Continue practice and Start new practice together whenever a
session is active. The resume card shows a short, plain-text coaching cue rather than stored
Markdown or diagnostics. Starting new requires confirmation, saves and ends the active practice
first, and reveals alternate focus choices only on request.

## Proposal and confirmation

The coach proposes an exercise; the singer explicitly accepts before recording controls appear.
Singer alternatives—different exercise, free sing, ask, and move on—remain available before
acceptance.

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

Desktop may keep the Compass sticky beside the timeline. Narrow screens place the Compass in normal
flow until a dedicated focus sheet is supported. Full analysis remains collapsed by default.
