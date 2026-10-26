# Durable Practice and Mobile Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploaded practice attempts complete durably in the background, keep exercise actions reachable in chronological mobile conversations, and turn the signed-in mobile entry screen into a clear resume-or-start decision.

**Architecture:** Store every post-upload attempt in a Supabase `practice_attempt_jobs` row and orchestrate analysis, persistence, coaching, and contract updates with Vercel Workflow steps keyed only by job ID. Load job state with each practice bundle, render it as a recoverable timeline artifact, and refresh it only while visible. Keep the conversation oldest-to-newest with a live-edge controller and mobile action dock; independently improve the home resume summary and split desktop/mobile shell navigation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Chakra UI 3, Supabase Postgres/Auth/Storage, Vercel Workflow SDK 5, Vitest, Python/Vercel Functions, pgTAP, Storybook.

## Global Constraints

- The singer must remain until upload acknowledgement; the UI may promise safe navigation only after the durable job endpoint succeeds.
- Workflow input contains only a job UUID; never persist a singer access token, service key, audio bytes, or provider response in Workflow state.
- Permit only one `queued`, `analyzing`, or `coaching` job per practice.
- Keep exercise timelines chronological with the newest item at the bottom.
- Do not enable another recording or ending the practice while an attempt job is active.
- Waiting guidance comes only from already-saved contract or exercise text and is limited to two short sentences.
- Mobile touch targets are at least 48 by 48 CSS pixels and fixed/sticky surfaces reserve safe-area-aware content space.
- Do not add an icon library; mobile navigation icons are local inline SVG components.
- Preserve the existing framework, visual tokens, route structure, coaching schemas, pedagogy resolution, and public bearer-token analysis contract.
- Apply every production behavior through a failing test first and verify the failure reason before implementation.

---

## File structure

- `supabase/migrations/20261026120000_durable_attempt_jobs.sql`: job table, constraints, indexes, transactional attempt persistence function, grants, and RLS.
- `supabase/tests/database/schema_contract.test.sql`: pgTAP contract for durable jobs and idempotent attempt creation.
- `lib/attemptJobs.ts`: browser job types, schemas, bundle helpers, stage copy, and waiting guidance.
- `lib/attemptJobs.test.ts`: pure job-state, selection, and copy tests.
- `lib/serverSupabase.ts`: service-role client used only by route handlers and Workflow steps.
- `lib/coachService.ts`: server-owned coaching input and model execution shared by the public route and Workflow.
- `lib/coachService.test.ts`: calibration/input/result behavior around extracted coaching service.
- `lib/jobAssertion.ts`: short-lived HMAC assertion creation and verification for the Python analyzer.
- `lib/jobAssertion.test.ts`: assertion scope, expiry, and tamper tests.
- `app/api/practice/attempt-jobs/route.ts`: authenticated job creation and Workflow start.
- `app/api/practice/attempt-jobs/[id]/retry/route.ts`: authenticated retry of failed durable work.
- `workflows/processPracticeAttempt.ts`: durable orchestration only.
- `workflows/practiceAttemptSteps.ts`: full-runtime side-effect steps.
- `api/analyze.py`: internal job-assertion request path while preserving the public request path.
- `tests/test_analyze_job_auth.py`: Python assertion/job lookup ownership tests.
- `lib/practice.ts`: include jobs in `PracticeBundle` and practice loads.
- `lib/api.ts`: browser job start/retry clients.
- `components/practice/PendingAttempt.tsx`: persisted pending/failed attempt card.
- `components/practice/PendingAttempt.test.ts`: static markup and copy tests.
- `components/practice/usePracticeJobRefresh.ts`: visibility-aware refresh lifecycle.
- `components/practice/usePracticeJobRefresh.test.ts`: pure refresh policy tests.
- `components/practice/useConversationLiveEdge.ts`: near-bottom, unseen-count, and jump controller.
- `components/practice/conversationLiveEdge.test.ts`: reducer/threshold tests without DOM coupling.
- `components/practice/PracticeConversationViewport.tsx`: sentinel, Jump to latest, and reserved dock spacing.
- `components/practice/PracticeComposer.tsx`: responsive sticky dock treatment.
- `components/practice/PracticeSession.tsx`: submit jobs, merge job state, remove client analysis chain, and integrate viewport/dock.
- `components/practice/PracticeSession.test.ts`: extracted session-state transition tests.
- `lib/practiceHome.ts`: concise resume-summary and replacement-practice transaction helper.
- `lib/practiceHome.test.ts`: Markdown sanitization, fallback, and replacement sequencing.
- `components/practice/PracticeHome.tsx`: above-fold Continue/Start-new actions and focus disclosure.
- `components/practice/PracticeHome.test.ts`: static home-card contracts.
- `components/AppNavigation.tsx`: separate desktop and mobile navigation renderers with local SVG icons.
- `components/AppNavigation.test.ts`: active-route and accessible markup tests.
- `components/Shell.tsx`: compact header, bottom-nav reservation, and navigation integration.
- `docs/design/components.md`, `docs/design/patterns.md`, `docs/database-deployments.md`: durable lifecycle, UI contracts, and deployment variables.

---

### Task 1: Add the durable attempt-job database contract

**Files:**
- Create: `supabase/migrations/20261026120000_durable_attempt_jobs.sql`
- Modify: `supabase/tests/database/schema_contract.test.sql`

**Interfaces:**
- Produces: `public.practice_attempt_jobs`, `public.create_attempt_from_job(p_job_id uuid) returns uuid`, and one-active-job enforcement used by all later tasks.
- Consumes: existing `practice_sessions`, `sessions`, ownership indexes, RLS helpers, and JSON text conventions.

- [ ] **Step 1: Write failing pgTAP assertions**

Increase the plan count and add assertions for the table, status check, owner/practice foreign key, unique `attempt_id`, active-job partial unique index, RLS, authenticated `SELECT`, denied authenticated `UPDATE`, and the persistence function. Add fixtures that prove a second active job for one practice fails and that two calls to `create_attempt_from_job(job_id)` return the same attempt UUID with only one session row.

```sql
select has_table('public', 'practice_attempt_jobs', 'attempt jobs exist');
select has_index(
  'public', 'practice_attempt_jobs',
  'practice_attempt_jobs_one_active_per_practice',
  'only one attempt job may process per practice'
);
select results_eq(
  $$ select public.create_attempt_from_job('11111111-1111-1111-1111-111111111130'::uuid) $$,
  $$ select public.create_attempt_from_job('11111111-1111-1111-1111-111111111130'::uuid) $$,
  'attempt creation is idempotent'
);
```

- [ ] **Step 2: Run the database contract and confirm RED**

Run: `supabase test db`

Expected: failure because `practice_attempt_jobs` and `create_attempt_from_job` do not exist.

- [ ] **Step 3: Add the migration**

Create the columns and checks exactly as the design specifies. Add a composite `(id, user_id)` unique index where required for owner-safe foreign keys, and:

```sql
create unique index practice_attempt_jobs_one_active_per_practice
  on public.practice_attempt_jobs (practice_session_id)
  where status in ('queued', 'analyzing', 'coaching');

create policy "attempt jobs are readable by owner"
  on public.practice_attempt_jobs for select
  using (auth.uid() = user_id);
```

Implement `create_attempt_from_job` as `security definer set search_path = ''`: lock the job row, return `attempt_id` if present, allocate `coalesce(max(sequence_number), 0) + 1` under a practice-level advisory transaction lock, insert the session from checkpoint fields, update `attempt_id`, and return it. Revoke direct execution from `anon` and `authenticated`; grant it only to `service_role`.

- [ ] **Step 4: Verify GREEN and migration hygiene**

Run: `supabase test db`

Expected: all pgTAP assertions pass.

Run: `yarn migrations:check`

Expected: the new timestamped migration is accepted and prior migrations are unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261026120000_durable_attempt_jobs.sql supabase/tests/database/schema_contract.test.sql
git commit -m "feat: add durable practice attempt jobs"
```

### Task 2: Add typed job state and bundle derivation

**Files:**
- Create: `lib/attemptJobs.ts`
- Create: `lib/attemptJobs.test.ts`
- Modify: `lib/practice.ts`

**Interfaces:**
- Produces: `AttemptJobRow`, `activeAttemptJob(jobs)`, `jobExerciseId(job, threads)`, `pendingGuidance(job, contract)`, and job-aware `PracticeBundle`.
- Consumes: `ExerciseThread`, `LearningContract`, `ExerciseSpec`, `ProposalMetadata`, and existing stored-JSON parsing.

- [ ] **Step 1: Write failing unit tests**

Cover status filtering, retry-to-root mapping, first-attempt temporary ID mapping, completed-job exclusion, and guidance precedence.

```ts
it("uses a saved cue before proposal copy", () => {
  expect(pendingGuidance(job({ proposal_metadata_json: '{"reason":"Sing softly"}' }), {
    ...initialContract("coach_pick"),
    tryCue: "Aim the first note before adding volume.",
  })).toBe("Aim the first note before adding volume. Don’t record another attempt yet.");
});

it("maps a pending first attempt to its durable job id", () => {
  expect(jobExerciseId(job({ id: "job-1", parent_attempt_id: null }), [])).toBe("job-job-1");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `yarn test lib/attemptJobs.test.ts`

Expected: failure because `lib/attemptJobs.ts` does not exist.

- [ ] **Step 3: Implement job schemas and pure helpers**

Define the five-state union, JSON fields, timestamps, `attempt_id`, and error fields. Parse optional stored exercise/proposal JSON defensively. Make `pendingGuidance` return a two-sentence string and strip line breaks from stored text. Extend `loadPractice` with an ordered `practice_attempt_jobs` query and return `jobs` in the bundle.

- [ ] **Step 4: Verify GREEN**

Run: `yarn test lib/attemptJobs.test.ts lib/practice.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/attemptJobs.ts lib/attemptJobs.test.ts lib/practice.ts lib/practice.test.ts
git commit -m "feat: load durable attempt job state"
```

### Task 3: Extract server coaching and secure internal analysis

**Files:**
- Create: `lib/serverSupabase.ts`
- Create: `lib/coachService.ts`
- Create: `lib/coachService.test.ts`
- Create: `lib/jobAssertion.ts`
- Create: `lib/jobAssertion.test.ts`
- Create: `tests/test_analyze_job_auth.py`
- Modify: `app/api/coach/route.ts`
- Modify: `api/analyze.py`

**Interfaces:**
- Produces: `generateCoachingForUser(args)`, `signJobAssertion(jobId)`, `verifyJobAssertion(token)`, and Python `_resolve_internal_job(request)`.
- Consumes: existing OpenRouter call, coaching schemas, pedagogy catalogue, Supabase service role, and `ATTEMPT_JOB_SIGNING_SECRET`.

- [ ] **Step 1: Write failing TypeScript extraction/security tests**

Test that calibration uses the server session count, malformed model output remains an error, a signed assertion round-trips only for its job ID, tampering fails, and an expired assertion fails.

```ts
it("rejects a job assertion after its expiry", () => {
  const token = signJobAssertion("11111111-1111-1111-1111-111111111130", 1_000);
  expect(() => verifyJobAssertion(token, 1_001)).toThrow("expired job assertion");
});
```

- [ ] **Step 2: Write failing Python internal-request tests**

Add tests proving that no assertion returns 401, a valid assertion resolves only the job-stored audio key, a mismatched request key is ignored/rejected, and a missing/foreign job returns 404 without downloading audio.

```py
def test_internal_job_uses_persisted_audio_key(monkeypatch):
    job = {"id": JOB_ID, "audio_key": f"{USER_ID}/owned.wav", "exercise_spec_json": None}
    monkeypatch.setattr(analyze, "_load_attempt_job", lambda job_id: job)
    assert analyze._resolve_internal_job(valid_headers(JOB_ID))["audio_key"] == job["audio_key"]
```

- [ ] **Step 3: Run both focused suites and confirm RED**

Run: `yarn test lib/coachService.test.ts lib/jobAssertion.test.ts`

Expected: missing modules/functions.

Run: `python -m pytest tests/test_analyze_job_auth.py -q`

Expected: missing internal job resolver.

- [ ] **Step 4: Implement the shared server services**

Move prompt formatting, session counting, model retry budget, schema parsing, and pedagogy resolution from `app/api/coach/route.ts` into `generateCoachingForUser`. Keep the route as authentication, Zod parsing, service invocation, and response mapping. Build HMAC-SHA256 assertions over `jobId.expiry`, compare signatures with `timingSafeEqual`, and require a minimum 32-byte secret.

In Python, accept `X-Attempt-Job-Assertion`, verify the same HMAC and expiry, load the job through the service-role REST endpoint, and source `audio_key` plus `exercise_spec_json` from that record. Preserve the existing bearer-token path byte-for-byte for calibration/free-sing callers.

- [ ] **Step 5: Verify GREEN and existing route behavior**

Run: `yarn test lib/coachService.test.ts lib/jobAssertion.test.ts lib/openrouter.test.ts`

Expected: all selected tests pass.

Run: `python -m pytest tests/test_analyze_job_auth.py tests/test_audio_io.py -q`

Expected: all selected Python tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/serverSupabase.ts lib/coachService.ts lib/coachService.test.ts lib/jobAssertion.ts lib/jobAssertion.test.ts app/api/coach/route.ts api/analyze.py tests/test_analyze_job_auth.py
git commit -m "refactor: expose secure coaching workflow services"
```

### Task 4: Implement the durable workflow and job endpoints

**Files:**
- Create: `workflows/processPracticeAttempt.ts`
- Create: `workflows/practiceAttemptSteps.ts`
- Create: `workflows/practiceAttemptSteps.test.ts`
- Create: `app/api/practice/attempt-jobs/route.ts`
- Create: `app/api/practice/attempt-jobs/route.test.ts`
- Create: `app/api/practice/attempt-jobs/[id]/retry/route.ts`
- Modify: `next.config.ts`
- Modify: `package.json`
- Modify: `yarn.lock`

**Interfaces:**
- Produces: `processPracticeAttempt(jobId)`, `createAttemptJob(request)`, and retry endpoint.
- Consumes: Task 1 database function, Task 3 coaching/assertion services, `/api/analyze`, and Workflow `start()`.

- [ ] **Step 1: Install and configure the Workflow SDK**

Run: `yarn add workflow@^5.2.3`

Wrap the existing config without changing its webpack behavior:

```ts
import { withWorkflow } from "workflow/next";
// existing nextConfig remains unchanged
export default withWorkflow(nextConfig);
```

- [ ] **Step 2: Write failing endpoint and step tests**

Use injected Supabase/fetch/model boundaries. Test ownership, ended practice, audio prefix, active-job conflict, `run.runId` persistence, workflow-start failure becoming a retryable failed job, compare-and-set transitions, one-attempt RPC use, coaching completion, and analysis-versus-coaching terminal error messages.

```ts
it("starts workflow with only the persisted job id", async () => {
  const response = await createAttemptJob(requestBody, deps);
  expect(deps.startWorkflow).toHaveBeenCalledWith(expect.any(Function), [JOB_ID]);
  expect(JSON.stringify(deps.startWorkflow.mock.calls[0])).not.toContain("access_token");
  expect(response.status).toBe(202);
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `yarn test app/api/practice/attempt-jobs/route.test.ts workflows/practiceAttemptSteps.test.ts`

Expected: missing endpoint and workflow modules.

- [ ] **Step 4: Implement job creation and retry routes**

Parse an exact Zod body of `practice_session_id`, `audio_key`, nullable `exercise_spec`, proposal metadata, nullable `parent_attempt_id`, and `attempt_kind`. Validate ownership with the caller-scoped Supabase client, insert `queued`, then:

```ts
const run = await start(processPracticeAttempt, [job.id]);
await service.from("practice_attempt_jobs")
  .update({ workflow_run_id: run.runId })
  .eq("id", job.id);
return NextResponse.json({ ...job, workflow_run_id: run.runId }, { status: 202 });
```

Wrap workflow start and run-ID persistence as one route-level failure boundary. If start fails, compare-and-set the new job to `failed` with `error_code = 'workflow_start_failed'`, return 503, and leave **Try handing off again** able to reuse the job and uploaded audio. Retry accepts only an owned `failed` job, clears its public error, compare-and-sets it to `queued`, and starts the same workflow with the same job ID.

- [ ] **Step 5: Implement workflow orchestration and durable steps**

Keep `processPracticeAttempt` deterministic:

```ts
export async function processPracticeAttempt(jobId: string) {
  "use workflow";
  try {
    await claimAnalysis(jobId);
    const analysis = await analyzeAttempt(jobId);
    const attemptId = await persistAnalysis(jobId, analysis);
    await claimCoaching(jobId);
    const coaching = await coachAttempt(jobId, attemptId);
    await completeAttempt(jobId, attemptId, coaching);
  } catch (error) {
    await failAttempt(jobId, serializableJobFailure(error));
    throw error;
  }
}
```

Each imported function in `practiceAttemptSteps.ts` begins with `"use step"`, loads current job state, and is safe when repeated. `analyzeAttempt` signs a short-lived assertion and calls the deployed `/api/analyze` origin with only the assertion header. `persistAnalysis` checkpoints JSON before calling the database RPC. `completeAttempt` writes coaching, derives the contract with `contractFromAttempt`, and marks completion after both writes succeed.

- [ ] **Step 6: Verify GREEN and build-time Workflow compilation**

Run: `yarn test app/api/practice/attempt-jobs/route.test.ts workflows/practiceAttemptSteps.test.ts`

Expected: all selected tests pass.

Run: `yarn build`

Expected: Next.js compiles generated Workflow routes and exits zero.

- [ ] **Step 7: Commit**

```bash
git add workflows app/api/practice/attempt-jobs next.config.ts package.json yarn.lock
git commit -m "feat: process practice attempts with durable workflows"
```

### Task 5: Hand uploaded recordings to jobs and restore pending attempts

**Files:**
- Modify: `lib/api.ts`
- Modify: `lib/api.test.ts`
- Create: `components/practice/PendingAttempt.tsx`
- Create: `components/practice/PendingAttempt.test.ts`
- Create: `components/practice/usePracticeJobRefresh.ts`
- Create: `components/practice/usePracticeJobRefresh.test.ts`
- Modify: `components/practice/PracticeSession.tsx`
- Create: `components/practice/PracticeSession.test.ts`
- Remove: `components/practice/AttemptProgress.tsx`

**Interfaces:**
- Produces: `startAttemptJob`, `retryAttemptJob`, `PendingAttempt`, visibility refresh policy, and job-driven session state.
- Consumes: Tasks 2 and 4 job contracts and existing upload callback.

- [ ] **Step 1: Write failing API and session transition tests**

Test the authenticated `202` client, retry call, upload-to-job state transition, first-attempt pending selection, retry pending ownership, completed-job replacement, and navigation/mutation capability split.

```ts
it("allows navigation but blocks recording and ending during a job", () => {
  expect(practiceCapabilities(activeJob)).toEqual({
    navigateApp: true,
    selectRecordedExercise: true,
    askCompletedAttempt: true,
    record: false,
    endPractice: false,
  });
});
```

- [ ] **Step 2: Write failing pending-card and refresh-policy tests**

Use `renderToStaticMarkup` for all five job states. Test that the live-region text changes by persisted stage, elapsed text is hidden from announcements, safe-leaving copy appears only after a job exists, and failed analysis/coaching expose different retry copy. Test five-second visible polling, hidden pause, focus refresh, and deduplicated in-flight refresh.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `yarn test lib/api.test.ts components/practice/PendingAttempt.test.ts components/practice/usePracticeJobRefresh.test.ts components/practice/PracticeSession.test.ts`

Expected: missing job APIs/components/helpers.

- [ ] **Step 4: Implement browser clients and pending UI**

`startAttemptJob` posts immutable proposal context after upload and validates the returned row. `PendingAttempt` gets all text from pure `jobStagePresentation(job)` and `pendingGuidance`. Render status, reassurance, guidance, inactive-recording notice, secondary elapsed time, and retry action.

- [ ] **Step 5: Replace the client analysis chain**

In `PracticeSession.onUploaded`, delete the direct `analyze → insertSession → coach → updateSessionCoaching` chain. Submit the job, clear draft-only state only after the server accepts it, refresh the bundle, and retain the uploaded key locally when handoff fails so **Try handing off again** does not upload twice. Remove `AttemptProgress` after all imports and uses are gone.

Render the pending job in its exercise timeline, map first-attempt job selection to its completed root, and keep selection unchanged when a background job in another recorded exercise completes.

- [ ] **Step 6: Add visibility-aware recovery**

Mount `usePracticeJobRefresh` only when an active job exists. Use a five-second interval while `document.visibilityState === "visible"`, refresh on `focus` and hidden-to-visible, and guard refresh with a promise ref. Stop automatically at `completed` or `failed`.

- [ ] **Step 7: Verify GREEN**

Run: `yarn test lib/api.test.ts components/practice/PendingAttempt.test.ts components/practice/usePracticeJobRefresh.test.ts components/practice/PracticeSession.test.ts lib/attemptJobs.test.ts`

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/api.ts lib/api.test.ts components/practice/PendingAttempt.tsx components/practice/PendingAttempt.test.ts components/practice/usePracticeJobRefresh.ts components/practice/usePracticeJobRefresh.test.ts components/practice/PracticeSession.tsx components/practice/PracticeSession.test.ts components/practice/AttemptProgress.tsx
git commit -m "feat: restore pending practice attempts after navigation"
```

### Task 6: Add live-edge conversation behavior and the mobile action dock

**Files:**
- Create: `components/practice/useConversationLiveEdge.ts`
- Create: `components/practice/conversationLiveEdge.test.ts`
- Create: `components/practice/PracticeConversationViewport.tsx`
- Modify: `components/practice/PracticeComposer.tsx`
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/PracticeConversation.test.ts`
- Modify: `docs/design/foundations.md`

**Interfaces:**
- Produces: `conversationLiveEdgeReducer`, `PracticeConversationViewport`, and responsive composer dock.
- Consumes: chronological `activeTimeline`, streaming state, active job state, and Chakra semantic tokens.

- [ ] **Step 1: Write failing live-edge reducer tests**

Test the 64-pixel threshold, user-scroll suspension, unseen increments only while away, explicit jump reset, exercise-change reset, and send/retry re-engagement.

```ts
it("does not drag a reader to new coaching", () => {
  const reading = reduce(initial, { type: "SCROLLED", distanceFromBottom: 180 });
  const updated = reduce(reading, { type: "ITEMS_APPENDED", count: 1 });
  expect(updated).toMatchObject({ following: false, unseen: 1 });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `yarn test components/practice/conversationLiveEdge.test.ts components/practice/PracticeConversation.test.ts`

Expected: missing reducer/viewport behavior.

- [ ] **Step 3: Implement the conversation viewport**

Wrap the timeline in a semantic region with a bottom sentinel. Calculate distance from the sentinel/scroll container, dispatch reducer events, follow appended or resized content only while `following`, and render a floating button with `aria-label={unseen ? `${unseen} new updates. Jump to latest` : "Jump to latest"}`. Use instant scroll under reduced motion.

- [ ] **Step 4: Convert the mobile composer to a dock**

At `base`, wrap composer/actions in `position: sticky`, `bottom: var(--mobile-nav-height)`, overlay background, top border, and safe-area-compatible padding inherited above the fixed nav. Measure the dock with `ResizeObserver` and publish `--practice-dock-height`; reserve `calc(var(--practice-dock-height) + 1rem)` after timeline content. At `md`, restore normal flow and zero reserved height.

Keep **Try again** full-width/primary and **Different exercise** secondary. During active jobs replace mutation actions with compact job status. Opening setup scrolls/focuses its local heading, not the document top.

- [ ] **Step 5: Verify GREEN and design constraints**

Run: `yarn test components/practice/conversationLiveEdge.test.ts components/practice/PracticeConversation.test.ts components/practice/PracticeSession.test.ts`

Expected: all selected tests pass.

Run: `yarn design:check`

Expected: no raw colors or forbidden design values.

- [ ] **Step 6: Commit**

```bash
git add components/practice/useConversationLiveEdge.ts components/practice/conversationLiveEdge.test.ts components/practice/PracticeConversationViewport.tsx components/practice/PracticeComposer.tsx components/practice/PracticeSession.tsx components/practice/PracticeConversation.test.ts docs/design/foundations.md
git commit -m "feat: keep mobile practice actions at the live edge"
```

### Task 7: Make the signed-in home immediately actionable

**Files:**
- Create: `lib/practiceHome.ts`
- Create: `lib/practiceHome.test.ts`
- Modify: `components/practice/PracticeHome.tsx`
- Create: `components/practice/PracticeHome.test.ts`
- Modify: `lib/practice.ts`

**Interfaces:**
- Produces: `practiceResumeSummary(contract)`, `replaceActivePractice(active, direction)`, and active-card action layout.
- Consumes: existing create/end practice calls and starting-direction controls.

- [ ] **Step 1: Write failing summary tests**

Cover next-direction/cue/focus precedence, Markdown headings/bold/list markers/underscored keys, first-sentence selection, whitespace, 140-character word-boundary truncation, and empty fallback.

```ts
it("does not expose raw diagnostic markdown on the home card", () => {
  const summary = practiceResumeSummary({
    focus: "**What the numbers tell you** - **jitter_0.004** — stable. More detail follows.",
  });
  expect(summary).toBe("What the numbers tell you — jitter 0.004 — stable.");
  expect(summary).not.toMatch(/\*\*|_/);
});
```

- [ ] **Step 2: Write failing home-card markup/state tests**

Extract a presentational `ActivePracticeCard` and render it statically. Assert that Continue precedes Start new, both are in the first action group, summary uses a three-line clamp, and direction choices are hidden behind **Choose a different focus** until opened. Test replacement sequencing with injected `end` and `create` functions; creation must not run when ending fails.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `yarn test lib/practiceHome.test.ts components/practice/PracticeHome.test.ts`

Expected: missing helper and active-card component.

- [ ] **Step 4: Implement concise summary and replacement transaction**

Normalize `compass.nextDirection`, `tryCue`, then `focus`; strip Markdown syntax without rendering HTML; select the first sentence/clause; cap at 140 characters. Add a server-safe `replaceActivePractice` sequence that calls the existing end contract with loaded attempts/contract, waits for success, then creates the replacement.

- [ ] **Step 5: Recompose the home screen**

Reduce the mobile hero heading/copy footprint. Put the active status, heading, three-line summary, Continue, and Start new in one raised card above the fold. Start new opens a confirmation dialog; **Choose a different focus** expands the existing direction controls below the actions. Keep unsafe actions hidden on load failure and reserve action-sized skeleton blocks while loading.

- [ ] **Step 6: Verify GREEN**

Run: `yarn test lib/practiceHome.test.ts components/practice/PracticeHome.test.ts lib/practice.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/practiceHome.ts lib/practiceHome.test.ts components/practice/PracticeHome.tsx components/practice/PracticeHome.test.ts lib/practice.ts
git commit -m "feat: surface resume and new practice actions"
```

### Task 8: Replace wrapped mobile tabs with accessible bottom navigation

**Files:**
- Create: `components/AppNavigation.tsx`
- Create: `components/AppNavigation.test.ts`
- Modify: `components/Shell.tsx`
- Modify: `components/AppFooter.tsx`

**Interfaces:**
- Produces: `DesktopNavigation`, `MobileNavigation`, `isActiveDestination(pathname, href)`, and `--mobile-nav-height` layout contract.
- Consumes: existing route list, Chakra responsive props, and Shell pathname.

- [ ] **Step 1: Write failing navigation tests**

Use `renderToStaticMarkup` to assert four native links, labels, decorative SVG icons, nested `/practice/:id` matching, one `aria-current="page"`, and no emoji/Unicode symbol icons. Unit-test `/practice` not matching an unrelated prefix such as `/practices-old`.

```ts
it("marks a nested practice route active", () => {
  expect(isActiveDestination("/practice/abc", "/practice")).toBe(true);
  expect(isActiveDestination("/practices-old", "/practice")).toBe(false);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `yarn test components/AppNavigation.test.ts`

Expected: missing navigation module.

- [ ] **Step 3: Implement local icons and responsive navigation**

Create four 24-by-24 SVG components using `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.8"`, rounded caps/joins, `focusable="false"`, and `aria-hidden="true"`. Desktop navigation retains the current links and underline treatment at `md` and above.

Mobile navigation is `nav aria-label="Primary"`, fixed at the viewport bottom, four equal grid columns, overlay surface, top border, safe-area padding, and z-index `sticky`. Each link has a 48-pixel minimum target, centered icon/label, and an active top marker plus color/weight change.

- [ ] **Step 4: Reserve shell and footer space**

Set `--mobile-nav-height` on the shell to the visual bar height plus safe area. Add bottom padding to the main/footer at `base` and remove it at `md`. Keep the top brand bar compact on mobile and hide only the desktop link row, not the brand or skip link.

- [ ] **Step 5: Verify GREEN and narrow markup**

Run: `yarn test components/AppNavigation.test.ts`

Expected: all navigation tests pass.

Run: `yarn design:check`

Expected: no design-token violations.

- [ ] **Step 6: Commit**

```bash
git add components/AppNavigation.tsx components/AppNavigation.test.ts components/Shell.tsx components/AppFooter.tsx
git commit -m "feat: add mobile bottom navigation"
```

### Task 9: Document operations and component contracts

**Files:**
- Modify: `docs/design/components.md`
- Modify: `docs/design/patterns.md`
- Modify: `docs/database-deployments.md`
- Modify: `README.md`

**Interfaces:**
- Produces: deploy checklist for `ATTEMPT_JOB_SIGNING_SECRET`, Workflow enablement, migration order, and UI lifecycle documentation.
- Consumes: completed implementation behavior from Tasks 1-8.

- [ ] **Step 1: Add documentation validation assertions**

Extend an existing documentation test or add `lib/deployDatabaseWorkflow.test.ts` assertions that deployment docs name the new migration, `ATTEMPT_JOB_SIGNING_SECRET`, Workflow-generated routes, and the post-deploy smoke test. Add exact component/pattern entries for `PendingAttempt`, live-edge following, the mobile dock, resume card, and mobile navigation.

- [ ] **Step 2: Run the documentation test and confirm RED**

Run: `yarn test lib/deployDatabaseWorkflow.test.ts`

Expected: failure because the required deployment instructions and component contracts are absent.

- [ ] **Step 3: Update documentation**

Document this deployment order: apply migration, set a random 32-byte-or-longer signing secret in every environment, deploy with Workflow integration, confirm generated `/.well-known/workflow/` routes, upload one short take, navigate away after acknowledgement, and verify the job reaches `completed`. Document rollback as disabling new job submission while retaining readable job/attempt rows; do not roll back the forward migration.

- [ ] **Step 4: Verify GREEN**

Run: `yarn test lib/deployDatabaseWorkflow.test.ts`

Expected: documentation assertions pass.

- [ ] **Step 5: Commit**

```bash
git add docs/design/components.md docs/design/patterns.md docs/database-deployments.md README.md lib/deployDatabaseWorkflow.test.ts
git commit -m "docs: describe durable practice operations"
```

### Task 10: Run full verification and mobile acceptance checks

**Files:**
- Modify only if a verification failure exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh evidence for code, database, build, Storybook, and mobile behavior.

- [ ] **Step 1: Run formatting and static design checks**

Run: `yarn format:check`

Expected: all targeted TypeScript and TSX files are formatted.

Run: `yarn design:check`

Expected: design checks pass.

Run: `yarn activities:check`

Expected: activity audio references remain valid.

Run: `yarn migrations:check`

Expected: migration history is valid and forward-only.

- [ ] **Step 2: Run all JavaScript/TypeScript tests**

Run: `yarn test`

Expected: all Vitest files pass with zero failures.

- [ ] **Step 3: Run all Python tests**

Run: `python -m pytest`

Expected: all Python tests pass with zero failures.

- [ ] **Step 4: Run the database suite**

Run: `supabase test db`

Expected: all pgTAP assertions pass with the durable job migration applied.

- [ ] **Step 5: Build production and Storybook**

Run: `yarn build`

Expected: Next.js and Workflow-generated routes compile successfully.

Run: `yarn storybook:build`

Expected: Storybook builds with zero errors and accessibility stories load.

- [ ] **Step 6: Perform the acceptance matrix**

At iPhone Safari dimensions, Android Chrome dimensions, 320-pixel width, and desktop:

1. Upload a take and verify the UI does not promise safe leaving before job acknowledgement.
2. Navigate to Progress after acknowledgement, lock/background the device, return to the practice, and verify persisted stage or completed coaching.
3. Force analysis and coaching failures separately and verify the correct reusable recovery action.
4. Scroll up during completion and verify position holds plus Jump to latest appears.
5. Verify Try again remains reachable and its setup opens at the live edge.
6. Verify Continue practice and Start new practice appear together above the fold with a clean three-line summary.
7. Verify starting new requires confirmation and leaves only one in-progress practice.
8. Verify four bottom navigation items remain equal, selected, unobscured, and safe-area aware.
9. Verify desktop top navigation and three-column practice layout remain unchanged.

- [ ] **Step 7: Commit any verification-only corrections**

If verification required corrections, stage only those focused files and commit:

```bash
git commit -m "fix: address durable practice verification"
```

If no correction was needed, do not create an empty commit.
