# Action-first Practice Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overloaded practice conversation with an immediately recordable practice workspace, a compact attempt index, and attempt-specific analysis and chat routes.

**Architecture:** Keep `loadPractice` and the existing durable attempt job as the shared data source. Extract pure workspace derivation, focused presentational components, and an attempt-detail client so `PracticeSession` owns recording while `AttemptDetail` owns review and chat. Deep-link retry state travels as an owned attempt UUID and is consumed into the existing exercise/proposal model.

**Tech Stack:** Next.js 15 App Router, React 19, Chakra UI 3, Supabase, Vitest, Vercel Workflow.

## Global Constraints

- No database migration or new dependency.
- Active practices open with reference playback and recording ready for the latest attempt's exercise.
- Practice hierarchy is `Practice → Attempts → Attempt detail → Attempt conversation`.
- The workspace shows no more than two short coaching statements before controls.
- Different exercise and End practice remain adjacent.
- Attempts are newest-first and do not expand full analysis on the workspace.
- New questions always use the selected attempt ID; null-attempt legacy messages remain readable only as general questions.
- Durable upload/job behavior and one-active-attempt enforcement remain unchanged.
- All new production behavior follows a failing test first.

---

## File structure

- `lib/practiceWorkspace.ts`: pure summary, retry-target, attempt-order, and message ownership helpers.
- `lib/practiceWorkspace.test.ts`: helper behavior and edge cases.
- `components/practice/PracticeActionWorkspace.tsx`: action-first summary and proposal shell.
- `components/practice/AttemptSummaryCard.tsx`: compact link to one attempt.
- `components/practice/BackToPracticeControls.tsx`: visibility-driven return control.
- `components/practice/PracticeWorkspace.test.ts`: static contracts for the new surfaces.
- `components/practice/PracticeSession.tsx`: recording workspace, durable state, history, and retry-query consumption.
- `components/practice/AttemptDetail.tsx`: owned attempt review and chat.
- `components/practice/AttemptDetail.test.ts`: route/view ownership and accessible copy.
- `app/practice/[id]/attempt/[attemptId]/page.tsx`: attempt detail route inside `Shell`.
- `docs/design/components.md`, `docs/design/patterns.md`: updated component and hierarchy contracts.

### Task 1: Add workspace derivation contracts

**Files:**
- Create: `lib/practiceWorkspace.ts`
- Create: `lib/practiceWorkspace.test.ts`

**Interfaces:**
- Produces: `practiceWorkspaceSummary(attempt, contract)`, `workspaceAttempt(attempts, requestedId)`, `attemptsNewestFirst(attempts)`, `messagesForAttempt(messages, attemptId)`, and `generalPracticeMessages(messages)`.
- Consumes: `SessionRow`, `PracticeMessageRow`, structured coaching JSON, and `LearningContract`.

- [ ] **Step 1: Write failing helper tests**

Cover structured coaching precedence, Markdown/whitespace removal, 160-character word-boundary caps, fallback copy, requested retry ownership, latest-attempt fallback, newest-first ordering, strict attempt message filtering, and null-only general messages.

```ts
expect(workspaceAttempt([first, latest], first.id)?.id).toBe(first.id);
expect(workspaceAttempt([first, latest], "foreign")?.id).toBe(latest.id);
expect(messagesForAttempt(messages, first.id).every((row) => row.attempt_id === first.id)).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `yarn test lib/practiceWorkspace.test.ts`

Expected: failure because `lib/practiceWorkspace.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Parse `coaching_json` with `coachingResponseSchema`. Return `{ encouragement?: string; focus: string }`, selecting `encouragement`, then contract strength for progress, and `top_issue` plus `tryCue` for focus. Sanitize text without interpreting measurements.

- [ ] **Step 4: Run GREEN**

Run: `yarn test lib/practiceWorkspace.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/practiceWorkspace.ts lib/practiceWorkspace.test.ts
git commit -m "feat: derive action-first practice state"
```

### Task 2: Add workspace presentation components

**Files:**
- Create: `components/practice/PracticeActionWorkspace.tsx`
- Create: `components/practice/AttemptSummaryCard.tsx`
- Create: `components/practice/BackToPracticeControls.tsx`
- Create: `components/practice/PracticeWorkspace.test.ts`

**Interfaces:**
- Consumes: Task 1 summary data, `SessionRow`, `PracticeProposal`, and existing `ExerciseProposal`/`PendingAttempt` children supplied by the session.
- Produces: `PracticeActionWorkspace`, `AttemptSummaryCard`, and `BackToPracticeControls` used in Task 3.

- [ ] **Step 1: Write failing static and controller tests**

Assert the workspace orders “How it is going” before “Focus on this” before its controls slot; the secondary row contains Different exercise and End practice; attempt cards link to `/practice/{practiceId}/attempt/{attemptId}`; and the return button reads Back to practice controls and targets `#practice-controls`.

- [ ] **Step 2: Run RED**

Run: `yarn test components/practice/PracticeWorkspace.test.ts`

Expected: missing component modules.

- [ ] **Step 3: Implement semantic responsive components**

Use existing `Surface`, `Eyebrow`, semantic tokens, a focusable `practice-controls-heading`, minimum 48-pixel actions, `IntersectionObserver`, and reduced-motion-aware `scrollIntoView`.

- [ ] **Step 4: Run GREEN and design check**

Run: `yarn test components/practice/PracticeWorkspace.test.ts && yarn design:check`

Expected: tests and token check pass.

- [ ] **Step 5: Commit**

```bash
git add components/practice/PracticeActionWorkspace.tsx components/practice/AttemptSummaryCard.tsx components/practice/BackToPracticeControls.tsx components/practice/PracticeWorkspace.test.ts
git commit -m "feat: add practice action workspace surfaces"
```

### Task 3: Make the practice route action-first

**Files:**
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/ExerciseProposal.tsx`
- Test: `lib/practiceWorkspace.test.ts`
- Test: `components/practice/PracticeWorkspace.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 components/helpers and existing job, reference, recorder, proposal, and end-practice APIs.
- Produces: an active practice route with controls first, history second, and no practice-wide conversation timeline.

- [ ] **Step 1: Add failing state tests for reopen and retry query**

Add assertions that a latest attempt creates a retry proposal with `parentAttemptId` equal to that attempt and that a valid requested attempt overrides the latest while an unknown ID does not.

- [ ] **Step 2: Run RED**

Run: `yarn test lib/practiceWorkspace.test.ts components/practice/PracticeWorkspace.test.ts`

Expected: retry-proposal derivation or required markup assertion fails.

- [ ] **Step 3: Refactor `PracticeSession`**

Read `retry` with `useSearchParams`; select the owned target; build/open its retry proposal during initial load; render `PracticeActionWorkspace` before a newest-first list of `AttemptSummaryCard`; render active `PendingAttempt` in the controls region; place Different exercise and End practice together; show null-attempt messages in a read-only general section; remove `PracticeConversationViewport`, inline `AttemptResult`, and practice-wide composer rendering.

- [ ] **Step 4: Remove obsolete live-edge wiring**

Delete unused practice-route imports and state while retaining chat functions only where moved to Task 4. Keep durable submission and reference cancellation byte-for-byte in behavior.

- [ ] **Step 5: Verify route integration**

Run: `yarn test lib/practiceWorkspace.test.ts components/practice/PracticeWorkspace.test.ts components/practice/PendingAttempt.test.ts components/practice/ExerciseProposal.test.ts && yarn build`

Expected: focused tests and production build pass.

- [ ] **Step 6: Commit**

```bash
git add components/practice/PracticeSession.tsx components/practice/ExerciseProposal.tsx lib/practiceWorkspace.test.ts components/practice/PracticeWorkspace.test.ts
git commit -m "feat: make practice sessions action first"
```

### Task 4: Add attempt-specific review and chat

**Files:**
- Create: `components/practice/AttemptDetail.tsx`
- Create: `components/practice/AttemptDetail.test.ts`
- Create: `app/practice/[id]/attempt/[attemptId]/page.tsx`
- Modify: `components/practice/AttemptResult.tsx`
- Modify: `components/practice/PracticeComposer.tsx`

**Interfaces:**
- Consumes: `loadPractice`, `savePracticeMessage`, `streamPracticeCoach`, `messagesForAttempt`, and existing `AttemptResult`/conversation renderers.
- Produces: attempt detail route with sticky Back/Try again navigation and strictly attempt-owned chat.

- [ ] **Step 1: Write failing detail tests**

Assert the contextual navigation links to `/practice/{practiceId}` and `/practice/{practiceId}?retry={attemptId}#practice-controls`; copy says Ask about this attempt; only matching messages render; and ended practices omit Try again and the composer.

- [ ] **Step 2: Run RED**

Run: `yarn test components/practice/AttemptDetail.test.ts`

Expected: missing detail component.

- [ ] **Step 3: Implement the route and detail client**

Load and verify the attempt from the owned bundle, derive its parent, render the full `AttemptResult`, show its matching messages, reveal the composer on demand, and submit/stream using the route attempt ID. Show a scoped not-found notice if ownership validation fails.

- [ ] **Step 4: Make review components context-specific**

Allow `AttemptResult` to start expanded on detail and retain its contextual ask actions. Add configurable heading/action copy to `PracticeComposer` without changing default semantics used elsewhere.

- [ ] **Step 5: Run GREEN and build**

Run: `yarn test components/practice/AttemptDetail.test.ts components/practice/PracticeConversation.test.ts lib/practiceChat.test.ts && yarn build`

Expected: tests pass and the new dynamic route appears in build output.

- [ ] **Step 6: Commit**

```bash
git add app/practice/[id]/attempt/[attemptId]/page.tsx components/practice/AttemptDetail.tsx components/practice/AttemptDetail.test.ts components/practice/AttemptResult.tsx components/practice/PracticeComposer.tsx
git commit -m "feat: add attempt-specific review and chat"
```

### Task 5: Update contracts and complete verification

**Files:**
- Modify: `docs/design/components.md`
- Modify: `docs/design/patterns.md`
- Modify: `docs/superpowers/specs/2026-10-26-durable-practice-mobile-entry-design.md`

**Interfaces:**
- Consumes: completed action workspace and attempt-detail behavior.
- Produces: authoritative design documentation and a fully verified PR branch.

- [ ] **Step 1: Update design documentation**

Document `PracticeActionWorkspace`, `AttemptSummaryCard`, `AttemptDetail`, attempt-owned chat, controls-first scrolling, and that the earlier Jump-to-latest practice pattern is superseded.

- [ ] **Step 2: Run repository verification**

Run: `yarn format && yarn format:check && yarn design:check && yarn activities:check && yarn migrations:check && yarn test`

Run: `uv run python -m pytest`

Run: `supabase test db`

Run: `yarn build && yarn storybook:build`

Expected: all checks pass; warnings are recorded separately from failures.

- [ ] **Step 3: Commit documentation/final formatting**

```bash
git add docs components app lib
git commit -m "docs: record attempt-centered practice hierarchy"
```

- [ ] **Step 4: Push and verify PR**

```bash
git push origin feat/durable-practice-mobile-entry
gh pr view 25 --json url,mergeable,mergeStateStatus,statusCheckRollup
```

Expected: PR #25 contains the new commits and is mergeable; remote checks may initially be pending.
