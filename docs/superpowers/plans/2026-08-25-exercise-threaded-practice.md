# Exercise-Threaded Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace attempt-level navigation with exercise threads that contain every retry and related chat inline, while supporting one client-only draft exercise.

**Architecture:** Derive exercise identity from the existing `parent_attempt_id` retry graph, with root attempts as stable thread IDs and guarded standalone fallbacks for broken or cyclic data. Keep message ownership attempt-specific, but aggregate rendering and model history across all attempt IDs in the selected exercise. `PracticeSession` remains the orchestration boundary and owns the single draft exercise lifecycle.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Chakra UI 3, Supabase, Zod, Vitest, Storybook, Prettier.

## Global Constraints

- Work within the existing stack and add no dependencies or schema migration.
- The sidebar heading is “Exercises,” the mobile label is “Exercise,” and the action is “+ New exercise.”
- Root attempts create exercise threads; direct retries and retries of retries remain in the root thread.
- Broken or cyclic parent links produce standalone threads so no attempt is hidden.
- Every attempt and message in the selected exercise appears inline in chronological order.
- Messages remain stored against a concrete attempt; unanchored exercise chat uses the latest attempt.
- Only one client-only draft exists, repeated New exercise actions reselect it, and refresh may discard it.
- Successful first recording replaces the draft; successful retries preserve the selected root exercise.
- Ended practices stay read-only.
- Existing concise Compass, database ownership, recorder cancellation, partial-save, coaching-retry, streaming, calibration, and accessibility behavior remains intact.

## File structure

- Create `lib/exerciseThreads.ts`: pure retry-graph grouping, selection, summaries, message collection, and timeline helpers.
- Create `lib/exerciseThreads.test.ts`: root/retry/cycle/missing-parent/grouping/timeline/selection behavior.
- Modify `lib/practiceChat.ts` and `lib/practiceChat.test.ts`: build exercise-scoped model history from an allowed attempt-ID set.
- Modify `app/api/practice/chat/route.ts`: load parent links, derive the validated exercise, and query all messages in it.
- Create `components/practice/ExerciseNavigator.tsx` and `components/practice/ExerciseNavigator.stories.tsx`: recorded exercise and draft navigation on desktop and mobile.
- Delete `components/practice/AttemptNavigator.tsx` and `components/practice/AttemptNavigator.stories.tsx` after all imports move.
- Modify `components/practice/PracticeConversation.tsx`: expose individual persisted and streaming message renderers for an interleaved timeline.
- Modify `components/practice/PracticeSession.tsx`: own selected exercise, draft identity, retry selection, timeline rendering, and exercise-level chat destinations.
- Modify `components/practice/PracticeComposer.tsx`: update exercise-level prompt copy without changing controls.
- Modify `docs/design/components.md` and `docs/design/patterns.md`: replace attempt-navigator guidance with the exercise-thread pattern.

---

### Task 1: Pure exercise thread derivation

**Files:**
- Create: `lib/exerciseThreads.ts`
- Create: `lib/exerciseThreads.test.ts`
- Modify: `lib/practice.ts`
- Modify: `lib/practice.test.ts`

**Interfaces:**
- Consumes: `SessionRow`, `PracticeMessageRow`, and attempts already ordered by practice sequence and timestamp.
- Produces: `ExerciseThread = { id: string; attempts: SessionRow[]; attemptIds: string[] }`.
- Produces: `ExerciseTimelineItem = { type: "attempt"; at: string; attempt: SessionRow } | { type: "message"; at: string; message: PracticeMessageRow }`.
- Produces: `groupExerciseThreads(attempts)`, `messagesForExercise(messages, thread)`, `exerciseTimeline(thread, messages)`, `latestAttempt(thread)`, and `selectedExerciseAfterRefresh(currentId, threads, newlyCreatedAttemptId?)`.

- [ ] **Step 1: Write failing retry-graph tests**

Create literal fixtures that prove roots, direct retries, and retries of retries group together while two initial attempts with identical specs stay separate:

```ts
const threads = groupExerciseThreads([
  attempt({ id: "root-a", parentId: null, kind: "initial", sequence: 1 }),
  attempt({ id: "retry-a1", parentId: "root-a", kind: "retry", sequence: 2 }),
  attempt({ id: "retry-a2", parentId: "retry-a1", kind: "retry", sequence: 3 }),
  attempt({ id: "root-b", parentId: null, kind: "initial", sequence: 4 }),
]);

expect(threads.map((thread) => [thread.id, thread.attemptIds])).toEqual([
  ["root-a", ["root-a", "retry-a1", "retry-a2"]],
  ["root-b", ["root-b"]],
]);
```

Add separate tests where a missing parent and a two-node parent cycle each return standalone threads containing every input attempt exactly once.

- [ ] **Step 2: Run grouping tests and verify RED**

Run: `yarn vitest run lib/exerciseThreads.test.ts`

Expected: FAIL because `lib/exerciseThreads.ts` and its exports do not exist.

- [ ] **Step 3: Implement guarded root resolution and chronological grouping**

Build an `attemptById` map. Resolve each attempt by walking parents with a local `visited` set. Return the current attempt ID as a standalone root when a parent is missing, when the current node repeats, or when a referenced parent is outside the supplied practice attempts. Group by resolved root, sort attempts with persisted `sequence_number` then `ts` and `id`, and sort threads by their first attempt.

Use exact exported types:

```ts
export type ExerciseThread = {
  id: string;
  attempts: SessionRow[];
  attemptIds: string[];
};

export function groupExerciseThreads(attempts: SessionRow[]): ExerciseThread[];
```

- [ ] **Step 4: Add failing message, timeline, and selection tests**

Assert that messages from all three attempts in one exercise are included, another exercise is excluded, and the literal timeline order is attempt → question → answer → retry. Assert initial selection chooses the last thread, valid selection is preserved, a newly created root is selected, and a newly created retry preserves its root selection.

```ts
expect(exerciseTimeline(threadA, messages).map(itemKey)).toEqual([
  "attempt:root-a",
  "message:question-a",
  "message:answer-a",
  "attempt:retry-a1",
]);

expect(selectedExerciseAfterRefresh("root-a", threads, "retry-a1")).toBe("root-a");
expect(selectedExerciseAfterRefresh("draft", threads, "root-b")).toBe("root-b");
```

- [ ] **Step 5: Run the new tests and verify RED**

Run: `yarn vitest run lib/exerciseThreads.test.ts`

Expected: FAIL because message aggregation, timeline, and exercise selection helpers are missing.

- [ ] **Step 6: Implement aggregation and remove superseded attempt-thread helpers**

Implement:

```ts
export function messagesForExercise(
  messages: PracticeMessageRow[],
  thread: ExerciseThread,
): PracticeMessageRow[];

export function exerciseTimeline(
  thread: ExerciseThread,
  messages: PracticeMessageRow[],
): ExerciseTimelineItem[];

export function latestAttempt(thread: ExerciseThread): SessionRow;

export function selectedExerciseAfterRefresh(
  currentId: string | null,
  threads: ExerciseThread[],
  newlyCreatedAttemptId?: string | null,
): string | null;
```

For timeline ties, render attempts before messages, then compare IDs for deterministic output. Remove `activePracticeThread` and `selectedAttemptAfterRefresh` from `lib/practice.ts`; migrate or delete their old tests so no attempt-level selection contract remains.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `yarn vitest run lib/exerciseThreads.test.ts lib/practice.test.ts`

Expected: PASS with every attempt represented exactly once.

- [ ] **Step 8: Commit**

```bash
git add lib/exerciseThreads.ts lib/exerciseThreads.test.ts lib/practice.ts lib/practice.test.ts
git commit -m "feat: derive practice exercise threads"
```

### Task 2: Exercise-scoped coach history

**Files:**
- Modify: `lib/practiceChat.ts`
- Modify: `lib/practiceChat.test.ts`
- Modify: `app/api/practice/chat/route.ts`

**Interfaces:**
- Consumes: `groupExerciseThreads(attempts)`, the validated request attempt, and complete practice messages.
- Produces: `buildExerciseChatHistory(messages, attemptIds, userMessageId)` with the latest 12 complete messages in chronological order.
- Preserves: concrete request `attempt_id` for user-message validation, assistant ownership, failure updates, and stream persistence.

- [ ] **Step 1: Replace the history test with a failing exercise-scope test**

Use two attempt IDs in the allowed set and one outside it:

```ts
expect(
  buildExerciseChatHistory(messages, new Set([rootId, retryId]), "current-user"),
).toEqual([
  { role: "user", content: "Question on the first take" },
  { role: "assistant", content: "Answer on the first take" },
  { role: "user", content: "Question after the retry" },
]);
```

The fixture must also include a complete message from another exercise, the current user message, an empty message, and a failed message, all excluded.

- [ ] **Step 2: Run the chat helper test and verify RED**

Run: `yarn vitest run lib/practiceChat.test.ts`

Expected: FAIL because `buildExerciseChatHistory` does not exist and current filtering accepts one attempt only.

- [ ] **Step 3: Implement allowed-set history filtering**

Rename the helper and change its signature:

```ts
export function buildExerciseChatHistory(
  messages: AttemptChatMessage[],
  attemptIds: ReadonlySet<string>,
  userMessageId: string,
): Array<{ role: "user" | "assistant"; content: string }>;
```

Filter by `attemptIds.has(message.attempt_id)`, complete status, non-current ID, and non-empty content; sort ascending, slice the latest 12, then map to model roles.

- [ ] **Step 4: Update the route to derive and query the validated exercise**

Select `id, parent_attempt_id, attempt_kind, sequence_number, ts, exercise_type, measurements_json, coaching_json` for all practice attempts. Derive threads with `groupExerciseThreads`, find the thread containing the already validated request attempt, and fail with status 400 if none exists.

Query complete messages by practice and `.in("attempt_id", exercise.attemptIds)` without a single-attempt equality filter. Pass `new Set(exercise.attemptIds)` to `buildExerciseChatHistory`. Limit the model `context.attempts` to `exercise.attempts`, while every assistant insert and status update continues to use `attempt.id`.

- [ ] **Step 5: Run focused tests and type-check through the production build**

Run: `yarn vitest run lib/practiceChat.test.ts && yarn build`

Expected: PASS; the route compiles with exercise-scoped context and concrete message ownership.

- [ ] **Step 6: Commit**

```bash
git add lib/practiceChat.ts lib/practiceChat.test.ts app/api/practice/chat/route.ts
git commit -m "feat: share coach chat across exercise retries"
```

### Task 3: Exercise navigator

**Files:**
- Create: `components/practice/ExerciseNavigator.tsx`
- Create: `components/practice/ExerciseNavigator.stories.tsx`
- Modify: `lib/exerciseThreads.ts`
- Modify: `lib/exerciseThreads.test.ts`
- Modify: `docs/design/components.md`

**Interfaces:**
- Consumes: `ExerciseThread[]`, `selectedExerciseId`, optional `{ id, name }` draft, disabled, and ended state.
- Produces: `onSelect(exerciseId)` and `onNewExercise()` events.
- Produces: `exerciseNavigationSummary(thread, index) = { label, name, attemptCount, outcome }`.

- [ ] **Step 1: Write failing summary tests**

Assert a two-attempt thread returns a stable exercise label, root exercise name, literal `2 attempts`, and the latest attempt outcome. Assert a one-attempt free-sing thread returns `1 attempt` and `Free sing`.

- [ ] **Step 2: Run the summary test and verify RED**

Run: `yarn vitest run lib/exerciseThreads.test.ts`

Expected: FAIL because `exerciseNavigationSummary` is missing.

- [ ] **Step 3: Implement navigator summaries and component**

Build the desktop navigation and mobile selector from the existing visual treatment, changing semantics and copy:

```tsx
<Surface as="nav" aria-label="Practice exercises">
  <Eyebrow tone="agency">Exercises</Eyebrow>
  <Button onClick={onNewExercise}>+ New exercise</Button>
  {/* recorded exercise controls and optional Draft exercise control */}
</Surface>
```

The optional draft appears exactly once and uses its stable draft ID. Each recorded row displays exercise label, name, attempt count, and latest outcome. The mobile selector includes the active draft option and uses `Exercise` as its visible label. Apply `disabled` to every selection control when work is in progress.

- [ ] **Step 4: Add Storybook states and design documentation**

Add stories for recorded exercises, selected draft, mobile-compatible long names, and ended practice. Replace the AttemptNavigator entry in `docs/design/components.md` with ExerciseNavigator responsibilities and state guidance.

- [ ] **Step 5: Run tests, formatting, Storybook, and verify GREEN**

Run: `yarn vitest run lib/exerciseThreads.test.ts && yarn format:check && yarn storybook:build`

Expected: PASS and Storybook includes the new ExerciseNavigator states. Keep the existing AttemptNavigator files temporarily so the branch remains buildable until `PracticeSession` moves to the new component in Task 4.

- [ ] **Step 6: Commit**

```bash
git add components/practice/ExerciseNavigator.tsx components/practice/ExerciseNavigator.stories.tsx lib/exerciseThreads.ts lib/exerciseThreads.test.ts docs/design/components.md
git commit -m "feat: navigate practice by exercise"
```

### Task 4: Exercise workspace, inline timeline, and single draft

**Files:**
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/PracticeConversation.tsx`
- Modify: `components/practice/PracticeComposer.tsx`
- Delete: `components/practice/AttemptNavigator.tsx`
- Delete: `components/practice/AttemptNavigator.stories.tsx`
- Modify: `lib/exerciseThreads.ts`
- Modify: `lib/exerciseThreads.test.ts`
- Modify: `docs/design/patterns.md`

**Interfaces:**
- Consumes: `groupExerciseThreads`, `selectedExerciseAfterRefresh`, `exerciseTimeline`, `latestAttempt`, and `ExerciseNavigator`.
- Produces: one selected recorded root ID or stable client-only draft ID, with `previousRecordedExerciseId` for cancel recovery.
- Preserves: existing recorder, proposal request token, analysis, coaching, partial-save, streaming, and ended-practice flows.

- [ ] **Step 1: Add failing draft transition tests**

Add pure state helpers to the test contract before implementing them:

```ts
expect(
  openExerciseDraft(
    { draftId: null, selectedExerciseId: "root-a", previousRecordedExerciseId: null },
    "draft",
  ),
).toEqual({
  draftId: "draft",
  selectedExerciseId: "draft",
  previousRecordedExerciseId: "root-a",
  created: true,
});

expect(
  openExerciseDraft(
    {
      draftId: "draft",
      selectedExerciseId: "root-a",
      previousRecordedExerciseId: "root-a",
    },
    "unused-new-id",
  ),
).toMatchObject({ selectedExerciseId: "draft", created: false });

expect(cancelExerciseDraft("root-a", [threadA, threadB])).toBe("root-a");
```

Use a caller-supplied draft ID so the pure helper does not generate randomness.

- [ ] **Step 2: Run draft tests and verify RED**

Run: `yarn vitest run lib/exerciseThreads.test.ts`

Expected: FAIL because draft transition helpers are missing.

- [ ] **Step 3: Implement pure draft transitions**

Export `openExerciseDraft(state, newDraftId)`, `cancelExerciseDraft(previousRecordedExerciseId, threads)`, and `recordedExerciseIdForAttempt(threads, attemptId)`. The last helper maps a newly saved retry back to its current root and maps a new root attempt to itself.

- [ ] **Step 4: Refactor the conversation into timeline message renderers**

Export `PracticeMessage` and `StreamingPracticeMessage` from `PracticeConversation.tsx`. Preserve current surfaces, anchors, roles, spacing, live-region text, and streaming cursor. `PracticeSession` will place these renderers between attempt cards inside one `Stack` labeled “Exercise conversation.”

- [ ] **Step 5: Replace attempt selection with exercise and draft state**

In `PracticeSession`:

- Derive `exerciseThreads` from `bundle.attempts`.
- Store `selectedExerciseId`, `draftExerciseId`, and `previousRecordedExerciseId`.
- On load, select the latest recorded exercise and create a draft only for a practice with no attempts.
- Make New exercise and Try a different exercise call one `openNewExercise` function. If a draft already exists, select it and focus setup without regenerating the proposal.
- Selecting a recorded exercise closes setup, clears draft-only anchors, and focuses its first heading.
- Render every item from `exerciseTimeline(activeExercise, bundle.messages)`.
- Use the source attempt ID for contextual anchors and the latest attempt ID for unanchored composer messages.
- Make Try again use the latest attempt as `parentAttemptId` and keep `selectedExerciseId` at the root.
- After a successful first draft recording, clear the draft and select the new root ID.
- After a successful retry, preserve the selected root ID.
- On Cancel, clear the draft and select `cancelExerciseDraft(previousRecordedExerciseId, exerciseThreads)`.
- Keep the draft selected after an unsaved first result.
- Hide composer and mutations for ended practices.
- After `PracticeSession` imports `ExerciseNavigator`, delete the superseded AttemptNavigator component and story.

- [ ] **Step 6: Update exercise-level copy and design pattern**

Change the composer placeholder to `Ask about this exercise or the coach’s feedback`. Update `docs/design/patterns.md` so exercise threads own conversations, retries append inline, and one temporary draft is permitted.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
yarn vitest run lib/exerciseThreads.test.ts lib/practiceChat.test.ts lib/practice.test.ts
yarn verify
uv run pytest
yarn migrations:check
supabase test db --local
git diff --check
```

Expected: all frontend, backend, build, Storybook, migration, and database checks pass. Existing Storybook dependency warnings may remain, but there must be no build failure.

- [ ] **Step 8: Commit the workspace slice**

```bash
git add components/practice/PracticeSession.tsx components/practice/PracticeConversation.tsx components/practice/PracticeComposer.tsx components/practice/AttemptNavigator.tsx components/practice/AttemptNavigator.stories.tsx lib/exerciseThreads.ts lib/exerciseThreads.test.ts docs/design/patterns.md
git commit -m "feat: organize practice conversations by exercise"
```

- [ ] **Step 9: Request independent code review and fix valid findings**

Review the complete range from this plan commit through the implementation head against `docs/superpowers/specs/2026-08-24-exercise-threaded-practice-design.md`. Fix every Critical and Important issue with a failing regression test first, commit the fixes, rerun affected checks, and obtain a merge-ready assessment.

### Task 5: Update the open pull request

**Files:**
- No repository file changes expected.

**Interfaces:**
- Consumes: clean branch, green verification, and merge-ready independent review.
- Produces: updated remote branch and PR #18 description/checks.

- [ ] **Step 1: Push the completed commits**

Run: `git push origin agent/fix-production-practice-migration`

Expected: the remote branch advances without force-push.

- [ ] **Step 2: Update PR #18**

Update the title to describe exercise-threaded practice and revise the body so it states that the sidebar groups exercises, retries share a conversation, drafts are client-only, and all current verification counts are accurate.

- [ ] **Step 3: Inspect checks**

Run: `gh pr checks 18`

Expected: application, database, Vercel, and review checks are visible; report pending checks accurately without claiming they passed.
