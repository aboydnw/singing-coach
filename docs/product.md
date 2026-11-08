# Singing Coach product guide

This is a concise map of the existing product and its sources, not a new roadmap.
It summarizes `main` at `75fcba98` (reviewed 2026-11-04). A repository contract is not
proof that a production deployment is healthy; check the relevant build and rollout.

## Purpose and near-term direction

Singing Coach is a personal singing-practice tool: record a short exercise or passage,
receive measurement-backed coaching, try one useful change, and review progress against
your own history. The experience should feel like a short lesson, with clear actions
and restrained, understandable feedback.

The owner's direction, confirmed on 2026-11-04, is to share the app with others soon
and support more users. It is not a commercial product yet; commercial use may be
considered if usage grows, but pricing and monetization are not decided.

The current implementation has private accounts and supports modern browsers, including
standalone iPhone use. The README's personal-scale cost assumptions are not a capacity
or launch-readiness guarantee. Verify processing, account isolation, recovery, and
operating costs for the intended rollout. The existing audio policy permits noncommercial
voices, but each asset's terms must cover the actual distribution; commercial use later
would require a fresh rights review.

## Current experience

- **Enter practice.** The main destinations are Practice, Calibrate, Progress, and
  Account. The home route, old Exercise route, and old Free-sing route redirect to
  Practice. Sign-in offers Google with an optional email fallback.
- **Start or resume.** Practice home pairs Continue practice with Start new practice.
  Starting fresh while a practice is active requires confirmation and ends the old
  practice first. Leaving or refreshing alone does not end it.
- **Make the next attempt.** The active practice opens with a short progress/focus
  recap, the exercise, reference playback, and recording controls. Different exercise
  and End practice stay nearby. There is no separate proposal-acceptance click.
  Stop keeps the take local and asks the singer to Send for analysis or Discard take.
  Discard also works during recording, returns to the same exercise, and sends nothing.
- **Recover safely.** Stay through recording, encoding, upload, and durable job
  acknowledgement. After “Recording uploaded,” persisted work owns analysis and
  coaching. Returning restores its stage or recovery action. Only one attempt may
  record or process at a time.
- **Review deliberately.** Attempts appear newest-first below the workspace. Each
  links to its own analysis and conversation. Questions must belong to the displayed
  attempt; legacy unanchored messages remain read-only general questions. Try again
  returns to the action workspace with the correct retry parent.
- **End explicitly.** Ending requires confirmation. Ended practices remain readable
  and offer no new recording, retry, or question controls.

The hierarchy is **Practice → Attempts → Attempt detail → Conversation**. The current
[patterns](design/patterns.md) and
[action-first specification](superpowers/specs/2026-10-26-action-first-practice-workspace-design.md)
define it. Charts and chat must not displace the next recording action.

## Coaching and measurement boundaries

- Lead with one actionable focus and a specific positive observation. Compare against
  the singer's own history; measurements are reference evidence, not universal verdicts.
  When history is insufficient, say the coach is still learning the singer's baseline.
- Technique comes from [curated pedagogy](../prompts/pedagogy.json). The model chooses
  known states and drills; canonical instructions and cautions are resolved and checked
  by the application. Cues use an external listening or sound target, not anatomy.
- Preserve the original-attempt/correction/retry relationship. Do not claim improvement
  without evidence or keep repeating an unclear correction indefinitely.
- Supported analysis includes target-note pitch accuracy, pitch contour, voice-quality
  and vibrato measurements. Unscored singing has no target-note accuracy claim.
  The deterministic DSP regression fixture and exercise-parity tests protect meaning.
- Historical overlays and “Hear it right” support learning through comparisons and sound.
  Resynthesis corrects supported pitch/vibrato behavior, not breathiness.

See [the coaching contract](../prompts/coaching.json), [coach service](../lib/coachService.ts),
[README architecture](../README.md), and [product patterns](design/patterns.md).

## Activities: implemented foundation versus intended direction

The repository contains 21 versioned technical activities and 12 curated public-domain
song passages, alongside range/transposition resolution and guided, unscored material.
Stored proposals preserve the resolved material so later catalogue edits do not rewrite
historical attempts.

The [varied-coaching design](superpowers/specs/2026-09-09-varied-human-coaching-design.md)
sets a technical-to-musical lesson direction, but is not a complete shipped-feature
checklist. For example, the current [lesson-stage helper](../lib/lessonStage.ts) selects
between technical work and song application; do not claim the full four-stage
orchestration described in that design is implemented.

Human-like vocal examples are an approved direction, **not an available asset set on
this baseline**. There are no committed reference vocals or `reference_audio` entries.
The product must label its pitch-guide fallback honestly and keep recording available.
[The audio policy](activity-audio.md) requires offline rendering, independent rights
metadata, and listening review before adding a vocal asset. Passing the audio checker
with zero assets does not mean vocals have shipped.

The varied-coaching design defers arbitrary commercial-song ingestion, accompaniment,
on-demand synthesis/GPU infrastructure, custom voice cloning, repertoire-first default
diagnosis, and expressive scoring beyond reliable measurements. Do not add these as
implied scope without a new decision.

## Privacy and reliability

Recordings and corrected clips are retained for playback in private, account-scoped
Supabase storage. Vercel processes audio; OpenRouter receives measurements and coaching
messages, not recordings. Preserve ownership checks, row-level security, and the
account-deletion contract. [The public privacy policy](../components/PrivacyPolicy.tsx)
is the source for user-facing promises; the older local-only Gradio model is historical.

Durable processing requires compatible database migrations, shared server-only signing
configuration, and reachable Workflow handlers. Follow the
[database deployment runbook](database-deployments.md); do not infer successful
deployment merely from an upload acknowledgement.

## Source map and historical context

- [Design-system authority](design/README.md), [patterns](design/patterns.md), and
  [component contracts](design/components.md) govern current interface meaning.
  Components own runtime behavior/accessibility, theme files own foundations, and
  Storybook demonstrates the contracts.
- [README](../README.md) remains useful for setup, architecture, measurement, and
  privacy context. Its old Exercise/Free-sing navigation and email-only instructions
  lag the current routes and auth components.
- The October 26 action-first specification explicitly supersedes the conversation-first
  practice layout in the [durable-mobile specification](superpowers/specs/2026-10-26-durable-practice-mobile-entry-design.md).
  Keep that earlier document's durability requirements, not its transcript-first UI.
- Dated `superpowers/specs/` explain decisions; `superpowers/plans/` record implementation
  plans. Verify their status against current contracts, code, and tests rather than
  treating every planned feature or old task checkbox as current authority.
- At this review, [PR #29](https://github.com/aboydnw/singing-coach/pull/29) is still open.
  Its Workflow-route scaffold and navigation polish are not part of this baseline.
  Keep this snapshot note current when that PR lands.

When sources disagree or a requested change expands these boundaries, surface the
specific decision instead of inventing product policy.
