# Durable practice and mobile entry design

## Status

Approved in conversation on 2026-10-26. This design extends the exercise-threaded practice model without changing its exercise ownership or chronological conversation rules.

## Problem

The product currently performs analysis, attempt persistence, coaching, and learning-contract updates in a client-side promise chain after a recording uploads. Navigating away, switching apps, or locking a phone can suspend or destroy the page before that chain finishes. The result is a lost attempt after a wait that commonly lasts one or two minutes.

The waiting state compounds the problem. It presents a spinner, elapsed time, and an instruction to stay on the page. It does not reassure the singer that the recording is safe, provide a useful activity, or report a durable stage.

The exercise conversation is also difficult to continue on a phone. Retry controls live after an increasingly long timeline. Repeating an exercise can require scrolling to the bottom, opening setup, and then being moved elsewhere on the page.

Finally, the signed-in landing page does not provide an effective mobile entry point. A legacy learning-contract focus can contain Markdown and long diagnostic prose, but the resume card renders it as plain text. That pushes the resume action below the first viewport. The current mobile navigation is a wrapped row from the desktop header, uses typographic symbols as icons, has weak selected-state treatment, and is not aligned as a stable bottom navigation.

## Goals

- Make an uploaded recording durable before analysis begins.
- Allow the singer to navigate within the site, switch apps, or lock the phone after upload acknowledgement without losing analysis or coaching.
- Restore pending and completed attempt state after navigation, refresh, or a later visit.
- Replace the passive spinner with truthful stages, leave-page reassurance, and one guidance-only activity based on saved coaching.
- Keep exercise conversations chronological while making retry, change-exercise, and question actions reachable on mobile.
- Preserve reading position when the singer scrolls into history and provide an explicit way back to the newest content.
- Make the signed-in landing page immediately actionable on a typical phone viewport.
- Render a concise, safe resume summary instead of raw or unbounded coaching prose.
- Replace the wrapped mobile header links with an aligned, recognizable, accessible bottom navigation.

## Non-goals

- Continuing an audio upload after the singer closes or backgrounds the browser. The singer must remain until upload acknowledgement.
- Recording multiple attempts concurrently or queuing another attempt while one is processing.
- Push notifications when coaching completes.
- Offline recording or offline job submission.
- Reversing conversation chronology.
- Adding a new icon library solely for navigation.
- Redesigning desktop navigation, authentication, Progress, Calibration, or Account content.
- Rewriting prior stored coaching or learning-contract data.

## Research-informed decisions

Normal conversation order remains oldest-to-newest, with the latest item at the bottom. A chat viewport should follow new content only while the reader is already near the live edge; scrolling upward suspends following and reveals a **Jump to latest** control. This follows established message-list behavior rather than inventing reverse chronology for one screen.

Browser lifecycle APIs are not the durability boundary. Background tabs are throttled, and Background Sync is not available consistently enough across mobile browsers for a core recording workflow. The upload acknowledgement is therefore the explicit handoff from device-owned work to server-owned work.

Vercel Workflow is the durable orchestrator. It provides step-level persistence and retry behavior for this multi-stage process. A Supabase job row remains the product-facing source of truth so the UI can recover independently of the workflow dashboard or a specific browser session.

References:

- [Vercel Workflow](https://vercel.com/workflows)
- [Vercel Queues and Workflow guidance](https://vercel.com/docs/queues)
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [MUI message-list behavior](https://mui.com/x/react-chat/material/message-list/)

## Architecture

### Durable boundary

Recording, WAV encoding, and Storage upload remain in `Recorder` because they require the local microphone and audio bytes. When upload succeeds, `PracticeSession` no longer calls analysis and coaching itself. It submits an authenticated attempt-job request containing the Storage key and immutable proposal context.

The start endpoint performs these operations before replying:

1. Authenticate the singer.
2. Validate that the practice belongs to the singer and is still in progress.
3. Validate that the Storage key belongs to the singer.
4. Reject a second active job for the same practice.
5. Insert the durable job row.
6. Start the workflow with the job ID only.
7. Persist the workflow run ID on the job.
8. Return the job representation.

The UI may show “Upload complete” only after the endpoint returns the durable job. Until then, leaving can still lose the local handoff and the copy must continue to say that the recording is uploading.

### Workflow and step boundaries

The workflow receives only the job UUID. It does not persist the singer's access token, service-role key, or an audio payload in workflow history. Each side-effecting function is a Workflow step and loads the job afresh using server credentials.

The steps are:

1. **Claim analysis:** atomically change `queued` to `analyzing`; return without duplication if the job already progressed.
2. **Analyze recording:** call the Python analysis function through a server-only authenticated request using the stored audio key and exercise specification.
3. **Persist analysis:** store measurements and contour on the job as a checkpoint, create the attempt if it does not yet exist, and associate its ID with the job.
4. **Claim coaching:** change `analyzing` to `coaching` after the attempt checkpoint exists.
5. **Generate coaching:** build history on the server for the job owner, call the existing coaching model logic, and return structured coaching.
6. **Persist completion:** update the attempt coaching, update the practice learning contract from the completed attempt, and mark the job `completed`.

Workflow retries are idempotent. The job ID is unique, `attempt_id` is unique when present, and each state transition uses a compare-and-set condition. A retried persist step updates or returns the already-created artifact rather than inserting another attempt. Sequence number allocation happens in the database transaction that creates the attempt so a retry cannot reuse or increment it twice.

Expected/transient failures are retried by Workflow. After retries are exhausted, a final error step marks the job `failed` with a stable error code and user-facing message. Raw provider responses, secrets, and stack traces are never stored in the public job row.

### Internal analysis authentication

The Python analysis function already reads audio using the Supabase service role. Workflow analysis requests use a server-only signed job assertion containing the job ID and a short expiry. The Python function verifies the assertion, loads the job with the service role, and analyzes only the `audio_key` stored on that job. It does not accept an arbitrary Storage key from an internal request.

Normal browser analysis requests used elsewhere keep their existing bearer-token ownership checks. The internal assertion is a separate path, not a bypass of the public contract.

### Database model

Add `practice_attempt_jobs` with:

- `id uuid primary key`;
- `user_id uuid not null references auth.users(id) on delete cascade`;
- `practice_session_id uuid not null references practice_sessions(id) on delete cascade`;
- `audio_key text not null`;
- `status text not null` constrained to `queued`, `analyzing`, `coaching`, `completed`, or `failed`;
- `exercise_spec_json text null`;
- `proposal_metadata_json text null`;
- `parent_attempt_id uuid null references sessions(id) on delete set null`;
- `attempt_kind text not null` constrained to `initial` or `retry`;
- `attempt_id uuid null unique references sessions(id) on delete set null`;
- `measurements_json text null` and `contour_json text null` as workflow checkpoints;
- `workflow_run_id text null`;
- `error_code text null` and `error_message text null`;
- `created_at`, `updated_at`, and `completed_at` timestamps.

Indexes support practice/status lookup and user ownership. A partial unique index permits only one `queued`, `analyzing`, or `coaching` job per practice. Row-level security permits a singer to select their own jobs. Inserts and workflow mutations occur through authenticated server routes or service-role workflow steps; the browser cannot directly change status or checkpoint fields.

Completed and failed jobs remain available with the practice record. The normal timeline renders a completed attempt from `sessions`, not a duplicate job card. A completed job without a readable attempt is treated as inconsistent data and shown as a recoverable error rather than silently disappearing.

### Server-owned coaching inputs

The durable path cannot trust or depend on client-provided history. The coaching step loads the job, practice, recent sessions, exercise specification, and measurements from Supabase. Existing prompt construction, schema validation, pedagogy resolution, calibration behavior, and model time budgets remain authoritative and are extracted behind a server function shared by the synchronous coaching route and Workflow step.

## Practice data and selection

`loadPractice` returns practice, attempts, messages, and attempt jobs. Client helpers derive active jobs separately from completed attempt threads.

A retry job belongs to the recorded exercise containing `parent_attempt_id`. A first-attempt job from a client draft uses its job ID as the temporary exercise selection. When its attempt is created, refresh maps that selection to the new root attempt without flashing a different exercise. Refreshing while that first attempt is pending restores the pending exercise from the server job, eliminating the current client-only draft loss after upload.

Only one active job exists per practice. Recording controls are disabled while it is active, but global site navigation, selecting and reading other recorded exercises, and asking questions on already-completed attempts remain available. End practice is disabled while an active job exists because the workflow still needs an editable practice and learning contract.

## Pending-attempt experience

Replace elapsed-time stage simulation with a persisted pending-attempt card in the exercise timeline. Its visible state is derived from the job:

- `queued`: **Recording uploaded** — “Your recording is safe. You can leave this page.”
- `analyzing`: **Listening to your take** — “We’re measuring the notes and steadiness.”
- `coaching`: **Preparing your coaching** — “Your analysis is saved while the coach prepares one useful next step.”
- `failed`: **This attempt needs another try** plus the narrow retry or recovery action.

Elapsed time is secondary and is not a live-region update. Stage headings use one polite status region. Completion refreshes the timeline without forcibly moving keyboard focus.

The card includes **While you wait**, containing exactly one guidance-only activity. The selection order is:

1. the latest saved learning-contract `tryCue`, when present;
2. the current exercise's first stored instruction or proposal reason;
3. “Take one easy breath and picture the first note before singing it.”

The copy explicitly says not to record another attempt yet. It never generates new coaching, claims a result, or asks the singer to perform through pain. Suggestions are kept to two short sentences and are safe to ignore.

The page polls jobs every five seconds only while visible and an active job exists. It also refreshes immediately on mount, browser focus, and transition from hidden to visible. Polling stops when the job completes or fails and pauses when the document is hidden. Concurrent refreshes are deduplicated.

## Exercise conversation and actions

### Chronology and live edge

Attempt cards and messages remain in chronological order. A bottom sentinel defines the live edge. On first opening an exercise, after the singer sends a question, or after they explicitly start retry setup, the view moves to the latest relevant content.

While the singer is within 64 CSS pixels of the bottom, appended content and growing streaming responses stay in view. Once the singer scrolls upward beyond that threshold, automatic following stops. New content does not disturb reading position.

A floating **Jump to latest** button appears above the mobile action dock whenever the singer is away from the live edge. If unseen timeline items arrived, its accessible label includes the count; otherwise it reads “Jump to latest.” Activating it scrolls to the sentinel, clears the unseen count, and re-enables following. Smooth scrolling is disabled under `prefers-reduced-motion`.

### Mobile action dock

On viewports below the existing `md` breakpoint, the exercise composer and action row become a sticky bottom dock within the practice page. It uses the overlay surface token, a top border, and `padding-bottom: max(space, env(safe-area-inset-bottom))`. The page reserves the measured dock height plus spacing so the newest timeline item and Jump button are never obscured.

The dock shows:

- the contextual question composer when a completed attempt is active;
- a full-width primary **Try again** action;
- a quieter **Different exercise** action;
- processing state in place of recording actions when a job is active.

Opening retry or different-exercise setup keeps the setup adjacent to the live edge and focuses its heading. It does not scroll to the document top. Desktop retains the existing in-flow composer and action row unless viewport testing shows it outside a normal reading flow; the desktop exercise navigator and Compass remain sticky as currently designed.

Ended practices remain read-only and show neither the dock nor Jump-to-latest unless the transcript itself overflows.

## Signed-in landing page

### Information hierarchy

The first mobile viewport must answer two questions: “Can I continue?” and “Can I start fresh?” The page header becomes compact on phones so the actionable practice card begins near the top.

When an active practice exists, its raised card contains, in this order:

1. `In progress` status;
2. **Continue where you left off** heading;
3. start date and a concise resume summary;
4. full-width primary **Continue practice** button;
5. full-width or clearly paired secondary **Start new practice** button.

Starting new while another practice is active opens a confirmation dialog explaining that the existing practice will be ended and remain available in Recent practice. Confirmation ends the old practice through the existing session-ending contract, then creates the selected new practice. It never creates two in-progress practices.

The starting-direction chooser remains available below the resume actions in a collapsed **Choose a different focus** disclosure. Opening it exposes the existing five choices and changes the new-practice button label to the selected direction. The default remains Coach's pick.

When there is no active practice, the current direction chooser and primary start action remain the main card, but the primary action is positioned before Recent practice and remains visible without scrolling through explanatory prose.

### Resume summary formatting

The landing page never renders raw Markdown or a full diagnostic paragraph. A pure summary helper selects the first usable value from:

1. `learning_contract_json.compass.nextDirection`;
2. `learning_contract_json.tryCue`;
3. `learning_contract_json.focus`;

It strips Markdown control characters, list markers, headings, measurement-key syntax, and repeated whitespace; takes only the first complete sentence or clause; and caps visible output at 140 characters with a word-boundary ellipsis. If no useful value remains, it shows “Your coach will pick up from your latest attempt.” The helper does not reinterpret measurements or mutate stored data.

Text uses `text-wrap: pretty`, a readable line height, and at most three lines on the resume card. The complete historical coaching remains available inside the practice, where Markdown is rendered properly.

### Home loading and errors

The loading skeleton reserves the action area so buttons do not jump dramatically into place. If practices fail to load, the retry notice remains above the main content. A failed load must not show a start action that could accidentally create another active practice without knowing current state.

## Mobile navigation

At the `md` breakpoint and below, replace the wrapped header tab row with a fixed bottom navigation. The brand remains in the top application bar; desktop retains the current top navigation.

The mobile navigation contains the existing four destinations in the existing order: Practice, Calibrate, Progress, Account. Each item is an equal-width link with:

- a consistent 24-pixel inline SVG icon using `currentColor` and a shared stroke width;
- a one-line label;
- a minimum 48-pixel touch target;
- centered icon and label on the same vertical axis as the other items;
- a visible focus ring;
- an active state conveyed by color, semibold label weight, and a small top indicator, not underline alone.

Icons are product-local SVG components for practice/note, calibration/tuning, progress/trend, and account/person. They have decorative `aria-hidden` treatment because the link label supplies the accessible name. No emoji or Unicode arrow/circle is used as a navigation icon.

The bottom bar uses the overlay surface, top border, and safe-area padding. `main` and the footer reserve its height so content and legal links are not hidden. The bar remains above the browser safe area and below practice-specific overlays in the z-index scale. Route matching continues to mark nested practice URLs active. Landscape and 320-pixel-wide layouts retain four equal items without wrapping or horizontal scrolling.

## Error and recovery behavior

- If job creation fails after upload, keep the uploaded Storage key in mounted client state and offer **Try handing off again**. Do not repeat the upload.
- If the page is destroyed before job creation succeeds, the upload may remain orphaned; this design does not claim otherwise. A later cleanup job may remove unreferenced recordings, but that is outside this scope.
- If analysis exhausts retries, show that analysis failed and allow retrying the durable job from the existing audio.
- If coaching exhausts retries after analysis persisted, keep the saved attempt and measurements visible and offer **Retry coaching**.
- If a workflow step is delivered more than once, compare-and-set transitions and unique attempt ownership prevent duplicate attempts or learning-contract updates.
- If the job completes while another exercise is selected, update its navigator summary without changing selection.
- If the job completes while the singer is reading earlier content, show unseen activity through Jump to latest without moving their viewport.
- If the active practice cannot be ended while starting a new one, preserve it and report the error; do not create the replacement.
- If mobile navigation route state is unavailable during hydration, render all items inactive until the pathname is known rather than guessing.

## Accessibility

- Persistent navigation uses `nav` with an accessible label and native links.
- Active navigation exposes `aria-current="page"`.
- Job stage changes announce once per persisted transition; elapsed time is `aria-hidden`.
- Jump to latest is a real button with an accessible unseen-count label.
- Sticky controls never cover focused content and respect keyboard viewport resizing.
- Focus remains where the singer placed it when background data refreshes.
- Confirmation dialogs restore focus to their trigger.
- All status and selection states use text or shape in addition to color.
- Touch targets are at least 48 by 48 CSS pixels on mobile.
- Motion respects `prefers-reduced-motion`.

## Security and privacy

- Workflow input contains only a job ID.
- The client cannot write workflow status, checkpoints, errors, attempt IDs, or workflow run IDs.
- Server steps verify job, practice, attempt parent, and audio ownership even though they use service credentials.
- Internal analysis assertions are short-lived, scoped to one job, and verified before service-role reads.
- User-facing errors contain no provider payload, secret, stack trace, or internal model identifier.
- Existing recording retention and account-deletion cascades apply to job rows through user and practice foreign keys.

## Testing strategy

### Database and server

- Migration contract covers constraints, indexes, RLS, cascade behavior, and the one-active-job invariant.
- Start endpoint rejects unauthenticated, foreign-practice, ended-practice, foreign-audio, and duplicate-active-job requests.
- Workflow steps transition through valid states, reject invalid transitions, and remain idempotent when repeated.
- Retried analysis persistence creates exactly one attempt and one sequence number.
- Coaching input is loaded server-side and preserves existing calibration and pedagogy behavior.
- Partial analysis success followed by coaching failure remains recoverable.
- Internal analysis assertions cannot select a different audio key or expired job.

### Practice UI

- Upload completion starts a job instead of client-side analysis and coaching.
- Active jobs restore after remount and map to the correct recorded or pending exercise.
- Visible pages poll; hidden pages pause; focus and visibility restoration refresh once.
- Pending cards render each real stage and deterministic waiting guidance.
- Completion replaces pending state with the completed attempt without duplicate cards.
- Navigation is available during processing while recording mutation controls remain unavailable.
- The thread follows only near the bottom, preserves a reader's scrolled position, counts unseen items, and jumps on request.
- The mobile dock reserves space, respects the safe area, and keeps retry and different-exercise actions reachable.

### Landing page and shell

- Resume-summary selection prefers next direction, then cue, then focus.
- Sanitization removes Markdown and limits summaries to 140 characters without splitting a word.
- An active-practice card exposes Continue and Start new in the first action group.
- Starting new requires confirmation, ends the active practice, and creates only one replacement.
- Loading and load-error states do not expose unsafe duplicate-start behavior.
- Mobile navigation has four equal, non-wrapping links, correct accessible names, and `aria-current` on nested routes.
- Main content and footer reserve bottom-navigation space.
- Desktop navigation remains unchanged.

### Regression verification

Run Prettier checking, design-token checking, activity checks, TypeScript/Vitest tests, Python tests, migration checks, the production Next.js build, and the Storybook build. Manually verify iPhone Safari dimensions including the bottom safe area, Android Chrome, a 320-pixel viewport, desktop layout, background/foreground recovery, a completed background job, analysis failure, coaching failure, and an ended practice.

## Documentation changes

- Update the attempt lifecycle pattern to include the durable handoff and persisted job stages.
- Update the component catalogue for the pending-attempt card, conversation live-edge behavior, mobile action dock, home resume actions, and mobile navigation.
- Document any required Workflow and internal-assertion environment configuration in the deployment/database documentation.

## Acceptance criteria

- After the UI reports upload completion, navigating away, switching apps, locking the phone, refreshing, or later reopening the practice does not lose the attempt job.
- Analysis and coaching continue through durable Workflow steps and recover from transient failures without duplicate attempts.
- Returning to the practice shows the persisted current stage or completed coaching.
- The waiting card truthfully names its stage, says leaving is safe, and offers one saved-context guidance activity without enabling another recording.
- Exercise threads remain chronological with the newest content at the bottom.
- Mobile users can reach Try again, Different exercise, and the question composer without traversing the full timeline.
- Automatic following stops when the singer reads history, and Jump to latest restores the live edge.
- The active-practice landing card shows concise plain text with no visible Markdown tokens or unbounded diagnostic dump.
- Continue practice and Start new practice are visible together in the active card's first action group on a typical phone viewport.
- Starting new with an active practice requires confirmation and never leaves two practices in progress.
- Mobile navigation is fixed, safe-area aware, evenly aligned, visibly navigational, and exposes the active destination accessibly.
- No sticky or fixed control obscures the newest timeline content, page content, footer links, or keyboard focus.
