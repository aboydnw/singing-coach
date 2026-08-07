# Product patterns

## Attempt lifecycle

`ready → recording → encoding → uploading → analyzing → coaching → completed`

Every async stage is visible in the existing artifact. A failure preserves the last recoverable
state and offers a specific retry. Only one attempt may record or process at a time.

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
