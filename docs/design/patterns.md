# Product patterns

## Attempt lifecycle

`ready → recording → stopping → review → encoding → uploading → queued → analyzing → coaching → completed`

Stop ends capture and releases the microphone; it does not upload or analyze. Review offers
Send for analysis and Discard take. Audio stays in browser memory until Send for analysis.
Discard is also available while recording or waiting for the final audio chunk, immediately
releases the microphone and returns focus to Record. It creates no stored recording or attempt.
Late recorder events cannot resurrect a discarded take. Review focuses Send for analysis;
controls wrap on narrow screens and status changes are announced politely.

The shared recorder applies this confirmation to practice, free singing, and calibration.
While reviewing, competing practice actions remain locked until Send or Discard. Sending is
the upload boundary: once confirmed, show preparation/upload progress rather than a discard
action that could falsely promise to retract transmitted audio. Leaving before confirmation
loses the local take. Errors permit a new recording without submitting failed audio.

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

## Microphone recovery

A microphone request must not trap the singer while a browser prompt is unanswered. Keep Record
locked during the request, offer Cancel microphone request, and restore the ready controls on
cancellation. Cancellation invalidates this attempt; the browser may still show its own prompt,
but any late stream is immediately closed and never recorded or uploaded.

Distinguish blocked permission, missing input, busy/unavailable input, and unsupported recording
with a specific next step. Announce lifecycle status politely and errors as alerts. Keep the same
controls-first layout and allow another take after an error. After cancellation, return keyboard
focus to Record and announce readiness. Record and Stop must remain safe under
repeated activation, and unmounting must close audio tracks and abort any pending upload.

## Signed-out welcome (established)

`WelcomePage` introduces the existing practice loop before asking a new singer to
sign in. `SignInPanel` owns the same Google action, optional email fallback, busy
state, and account/auth notices. Notices appear immediately before the controls.
Authenticated routes and OAuth callbacks are unchanged. The welcome is shared by
all signed-out protected routes, including the home-to-Practice redirect.

Use the semantic theme, a single page heading, a skip link, a stacked phone layout,
and visible keyboard focus. The page requests no microphone access and plays no
audio. Copy must distinguish private account storage from audio processing, describe
AI uncertainty, and avoid pricing, guaranteed improvement, or available vocal-example
claims. The existing Auth/SignInPanel stories cover default, busy, cancelled, deleted,
and email-fallback states.

## Scannable coaching (established)

Coach snapshot and attempt feedback have a short reading layer: focus/observation,
a next cue, and a separate strength. Attempt explanations have their own labeled
section; the whole observation is never styled as a headline. Next cues and cautions
come from the stored contract or server-resolved technique, not a new generated drill.

Long fields show a plain-text excerpt and a native, keyboard-accessible disclosure
containing the complete original guidance. Excerpts are previews, not rewritten
diagnoses. Short fields need no disclosure. Do not clamp away content or hide a
canonical caution. Full measurements remain behind the existing analysis control.
The shared Markdown renderer preserves paragraphs, lists and emphasis, wraps long
tokens, uses body-sized text, and does not execute raw HTML or fetch generated images.
Test both inverse snapshot and light attempt surfaces at narrow phone widths and
with enlarged text. CoachingReading stories use synthetic data only.
