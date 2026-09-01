# Attempt-Threaded Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize practice into attempt-owned conversations with a selectable attempt navigator, inline retry controls, and a three-sentence session-wide Practice Compass.

**Architecture:** Add an optional database foreign key from practice messages to attempts, while requiring it for every new application write. Keep `PracticeSession` as the orchestration boundary, extract pure thread-selection/grouping helpers and a focused `AttemptNavigator`, and filter the chat API by the selected attempt. Extend structured coaching with a bounded `compass` object so compact session guidance is generated separately from detailed attempt feedback.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Chakra UI 3, Supabase/Postgres, Zod, Vitest, Storybook, Prettier.

## Global Constraints

- Work within the existing stack and do not add dependencies.
- New attempt rows appear only after a recording is successfully saved.
- New messages require an attempt that belongs to the supplied practice session.
- The Compass contains exactly Overall trend, This session, and Next direction.
- Each generated Compass field targets 140 characters and has a hard maximum of 180 characters.
- Existing attempt analysis, recorder, partial-save, calibration, streaming, and ended-practice behavior must remain available.
- Desktop uses a three-column workspace; narrow layouts use an attempt selector above the thread and place the Compass in normal flow.

## File structure

- Create `supabase/migrations/20260824120000_attempt_scoped_messages.sql`: add and backfill `attempt_id`, its foreign key, and its read index.
- Modify `supabase/tests/database/schema_contract.test.sql`: assert the new database contract.
- Modify `prompts/coaching.json`: require concise structured Compass output.
- Modify `lib/schema.ts` and `lib/schema.test.ts`: define and verify Compass schemas and length limits.
- Modify `lib/api.ts`, `lib/sessions.ts`, and `app/api/coach/route.ts`: carry current-practice metadata into structured coaching.
- Modify `lib/practice.ts` and `lib/practice.test.ts`: persist attempt ownership, normalize Compass fallbacks, and expose thread helpers.
- Modify `app/api/practice/chat/route.ts`: validate the selected attempt and scope history and assistant writes to it.
- Create `components/practice/AttemptNavigator.tsx` and `components/practice/AttemptNavigator.stories.tsx`: own desktop/mobile attempt selection presentation.
- Modify `components/practice/PracticeComposer.tsx`: become an inline composer with thread-footer actions.
- Modify `components/practice/PracticeSession.tsx`: orchestrate selection, attempt-specific messages, proposal mode, and three-column composition.
- Modify `components/practice/PracticeCompass.tsx` and `components/practice/PracticeCompass.stories.tsx`: render only the compact Compass fields.
- Modify `docs/design/components.md` and `docs/design/patterns.md`: record the new established attempt-thread pattern.

---

### Task 1: Structured compact Compass

**Files:**
- Modify: `prompts/coaching.json`
- Modify: `lib/schema.ts`
- Modify: `lib/schema.test.ts`
- Modify: `app/api/coach/route.ts`
- Modify: `lib/api.ts`
- Modify: `lib/sessions.ts`
- Modify: `lib/practice.ts`
- Test: `lib/schema.test.ts`
- Test: `lib/practice.test.ts`

**Interfaces:**
- Produces: `CompassSummary = { overallTrend: string; currentSession: string; nextDirection: string }`.
- Produces: model field `compass = { overall_trend: string; current_session: string; next_direction: string }`.
- Produces: `HistoryEntry.practice_session_id: string | null` and `coach(..., currentPracticeSessionId?: string | null)`.
- Consumes: existing `CoachingResponse`, session history, and `LearningContract` fallback fields.

- [ ] **Step 1: Write failing schema and contract tests**

Add tests that parse a valid three-field Compass, reject a 181-character field, and verify `contractFromAttempt` maps snake-case model fields into camel-case contract fields:

```ts
expect(
  coachingResultSchema.parse({
    ...validCoaching,
    compass: {
      overall_trend: "Pitch starts are becoming more consistent across practices.",
      current_session: "Today’s retries moved closer to the target.",
      next_direction: "Keep the cleaner onset while changing notes.",
    },
  }).compass.current_session,
).toContain("Today");

expect(() =>
  compassModelSchema.parse({
    overall_trend: "x".repeat(181),
    current_session: "Current evidence.",
    next_direction: "Next direction.",
  }),
).toThrow();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `yarn test lib/schema.test.ts lib/practice.test.ts`

Expected: FAIL because Compass schemas and contract mapping do not exist.

- [ ] **Step 3: Add the strict Compass schema and prompt contract**

Add a required nested `compass` object to `prompts/coaching.json`, with `maxLength: 180` on each field and descriptions requiring one plain-language sentence. Add the same constraints to Zod:

```ts
export const compassModelSchema = z.object({
  overall_trend: z.string().min(1).max(180),
  current_session: z.string().min(1).max(180),
  next_direction: z.string().min(1).max(180),
});

export const compassSummarySchema = z.object({
  overallTrend: z.string().min(1).max(180),
  currentSession: z.string().min(1).max(180),
  nextDirection: z.string().min(1).max(180),
});
```

Extend `coachingResultSchema` with `compass: compassModelSchema`. Extend `learningContractSchema` with `compass: compassSummarySchema.optional()` to keep old stored contracts readable.

- [ ] **Step 4: Supply session identity to coaching and map the result**

Add `practice_session_id` to `HistoryEntry`, include it in `toHistory`, accept `current_practice_session_id` in the coach route request, and describe the two history scopes in the task prompt. Change the client signature to:

```ts
export async function coach(
  measurements: Measurements,
  exerciseSpec: ExerciseSpec | null,
  history: HistoryEntry[],
  currentPracticeSessionId: string | null = null,
): Promise<CoachingResponse>
```

Pass the active practice ID from `PracticeSession`. In `contractFromAttempt`, store:

```ts
compass: {
  overallTrend: coaching.compass.overall_trend,
  currentSession: coaching.compass.current_session,
  nextDirection: coaching.compass.next_direction,
}
```

Add `compassForContract(contract)` that returns this object when present and otherwise creates three short, non-diagnostic fallbacks from `focus`, `strength`, and `readyWhen`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `yarn test lib/schema.test.ts lib/practice.test.ts`

Expected: PASS with the new Compass required for model output and optional for stored legacy contracts.

- [ ] **Step 6: Commit**

```bash
git add prompts/coaching.json lib/schema.ts lib/schema.test.ts app/api/coach/route.ts lib/api.ts lib/sessions.ts lib/practice.ts lib/practice.test.ts
git commit -m "feat: generate a concise practice compass"
```

### Task 2: Attempt ownership in storage

**Files:**
- Create: `supabase/migrations/20260824120000_attempt_scoped_messages.sql`
- Modify: `supabase/tests/database/schema_contract.test.sql`
- Modify: `lib/practice.ts`
- Test: `lib/practice.test.ts`

**Interfaces:**
- Produces: `PracticeMessageRow.attempt_id: string | null`.
- Produces: `savePracticeMessage({ attemptId: string, ... })` for all new messages.
- Consumes: `sessions.id`, `sessions.practice_session_id`, message context anchors, and timestamps.

- [ ] **Step 1: Write failing model and database-contract tests**

Add a `PracticeMessageRow` fixture and assert `messagesForAttempt(messages, "attempt-2")` returns only rows whose `attempt_id` matches. Increase the pgTAP plan and add assertions for `practice_messages.attempt_id`, its foreign key, and the composite read index.

- [ ] **Step 2: Run focused tests and migration validation and verify RED**

Run: `yarn test lib/practice.test.ts && yarn migrations:check`

Expected: the TypeScript test fails because the message field/helper is missing; the new database assertions are not yet satisfied by a migration.

- [ ] **Step 3: Add the forward-only migration**

Implement this deterministic backfill order in SQL: matching context-anchor `sourceId`, latest attempt at or before `created_at`, then earliest attempt. Preserve messages from practices with no attempts as null. Add the foreign key and index:

```sql
alter table public.practice_messages add column if not exists attempt_id uuid;

alter table public.practice_messages
  add constraint practice_messages_attempt_id_fkey
  foreign key (attempt_id) references public.sessions (id) on delete cascade;

create index if not exists practice_messages_practice_attempt_created
  on public.practice_messages (practice_session_id, attempt_id, created_at);
```

Use guarded catalog checks before adding a named constraint so local resets are repeatable.

- [ ] **Step 4: Update client types and writes**

Add `attempt_id` to `PracticeMessageRow`. Require `attemptId` in `savePracticeMessage`, persist it as `attempt_id`, and add:

```ts
export function messagesForAttempt(
  messages: PracticeMessageRow[],
  attemptId: string,
): PracticeMessageRow[] {
  return messages.filter((message) => message.attempt_id === attemptId);
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `yarn test lib/practice.test.ts && yarn migrations:check`

Expected: PASS and the migration checker reports all timestamped migrations valid.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824120000_attempt_scoped_messages.sql supabase/tests/database/schema_contract.test.sql lib/practice.ts lib/practice.test.ts
git commit -m "feat: scope practice messages to attempts"
```

### Task 3: Attempt-scoped chat API

**Files:**
- Modify: `lib/api.ts`
- Modify: `app/api/practice/chat/route.ts`
- Create: `lib/practiceChat.ts`
- Create: `lib/practiceChat.test.ts`

**Interfaces:**
- Produces: `streamPracticeCoach(practiceSessionId, attemptId, message, ...)`.
- Produces: `practiceChatRequestSchema` and `buildAttemptChatHistory(messages, userMessageId)`.
- Consumes: valid attempt ownership and `PracticeMessageRow.attempt_id` from Task 2.

- [ ] **Step 1: Write failing request/history tests**

Test that the request schema requires UUID `attempt_id`, that history excludes messages from other attempts, and that the current user message is not duplicated:

```ts
expect(
  buildAttemptChatHistory(messages, "attempt-a", "current-user"),
).toEqual([
  { role: "user", content: "Earlier question" },
  { role: "assistant", content: "Earlier answer" },
]);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `yarn test lib/practiceChat.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure chat request/history helpers**

Move the request schema and history conversion into `lib/practiceChat.ts`. Filter complete messages by `attempt_id`, preserve chronological order, exclude `userMessageId`, and cap the final history at 12 rows.

- [ ] **Step 4: Validate ownership before inserting or streaming**

In the route, query `sessions` for the submitted `attempt_id` plus `practice_session_id`. Return 400 with `attempt does not belong to this practice` when there is no match. Add `attempt_id` to assistant inserts, message lookup, update filters, and model-history reads. Keep all-attempt measurement summaries as background context.

Update the client call to include `attempt_id` in its JSON body.

- [ ] **Step 5: Run focused and related tests and verify GREEN**

Run: `yarn test lib/practiceChat.test.ts lib/openrouter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts app/api/practice/chat/route.ts lib/practiceChat.ts lib/practiceChat.test.ts
git commit -m "feat: keep coach chat within an attempt"
```

### Task 4: Attempt navigator and selection model

**Files:**
- Create: `components/practice/AttemptNavigator.tsx`
- Create: `components/practice/AttemptNavigator.stories.tsx`
- Modify: `lib/practice.ts`
- Modify: `lib/practice.test.ts`

**Interfaces:**
- Produces: `AttemptNavigator({ attempts, selectedAttemptId, onSelect, onNewAttempt, disabled, ended })`.
- Produces: `selectedAttemptAfterRefresh(currentId, attempts, newlyCreatedId?)`.
- Consumes: `SessionRow`, stored exercise/coaching JSON, and Chakra semantic tokens.

- [ ] **Step 1: Write failing selection-helper tests**

Cover latest-on-first-load, preserving a valid selection, falling back after removal, and preferring a newly created attempt:

```ts
expect(selectedAttemptAfterRefresh(null, attempts)).toBe("attempt-3");
expect(selectedAttemptAfterRefresh("attempt-1", attempts)).toBe("attempt-1");
expect(selectedAttemptAfterRefresh("missing", attempts)).toBe("attempt-3");
expect(selectedAttemptAfterRefresh("attempt-1", attempts, "attempt-3")).toBe(
  "attempt-3",
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `yarn test lib/practice.test.ts`

Expected: FAIL because the selection helper is missing.

- [ ] **Step 3: Implement the pure selection and summary helpers**

Return `null` for an empty attempt list. Add `attemptNavigationLabel(attempt, index)` and `attemptOutcome(attempt)` that safely parse stored JSON and produce short fallbacks without throwing.

- [ ] **Step 4: Build the accessible navigator and stories**

Use `<nav aria-label="Practice attempts">` on desktop and a labeled native `<select>` or Chakra select on narrow layouts. Attempt buttons use `aria-current="true"` when selected and show attempt number, retry status, exercise name, and one short outcome. Put New attempt at the top; hide it for ended practices and disable it during processing. Add active, retry, long-copy, and ended Storybook fixtures.

- [ ] **Step 5: Run tests, Storybook build, and verify GREEN**

Run: `yarn test lib/practice.test.ts && yarn storybook:build`

Expected: PASS with no missing imports or accessibility build errors.

- [ ] **Step 6: Commit**

```bash
git add components/practice/AttemptNavigator.tsx components/practice/AttemptNavigator.stories.tsx lib/practice.ts lib/practice.test.ts
git commit -m "feat: add the practice attempt navigator"
```

### Task 5: Recompose the practice workspace around the selected thread

**Files:**
- Modify: `components/practice/PracticeComposer.tsx`
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/PracticeConversation.tsx`
- Modify: `lib/practice.ts`
- Modify: `lib/practice.test.ts`
- Modify: `docs/design/components.md`
- Modify: `docs/design/patterns.md`

**Interfaces:**
- Consumes: `AttemptNavigator`, `messagesForAttempt`, `selectedAttemptAfterRefresh`, and attempt-aware chat API.
- Produces: selected attempt thread with inline composer, footer actions, and proposal setup.

- [ ] **Step 1: Add a failing active-thread view-model test**

Add `activePracticeThread(attempts, messages, selectedAttemptId)` tests to `lib/practice.test.ts`. Assert it returns exactly one selected attempt and only that attempt's messages, returns an empty thread before the first attempt, and never falls back to messages with a null legacy `attempt_id`:

```ts
expect(activePracticeThread(attempts, messages, "attempt-2")).toEqual({
  attempt: attempts[1],
  messages: [attempt2Question, attempt2Answer],
});
expect(activePracticeThread([], messages, null)).toEqual({
  attempt: null,
  messages: [],
});
```

- [ ] **Step 2: Run the active-thread and selection tests and verify RED**

Run: `yarn test lib/practice.test.ts`

Expected: FAIL because `activePracticeThread` does not exist.

- [ ] **Step 3: Make the composer inline and move actions into its footer**

Remove fixed positioning, overlay blur, page-wide sizing, and the Free sing shortcut. Add explicit `onRetry` and `onDifferent` controls after the input. Keep anchor removal, Enter/Shift+Enter, Stop, disabled, and streaming behavior.

- [ ] **Step 4: Add selected-attempt and setup state to `PracticeSession`**

Track:

```ts
const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
const [setupOpen, setSetupOpen] = useState(false);
```

Preserve selection in `refresh`, select a new saved attempt, clear context anchors when selecting another attempt, and abort or block switching while a response is streaming. Pass the selected attempt ID into `savePracticeMessage` and `streamPracticeCoach`.

- [ ] **Step 5: Render the three-column workspace**

Use a desktop grid approximately `15rem minmax(0, 1fr) 18rem`. Render only the selected `AttemptResult`, its filtered conversation, inline composer, thread actions, then proposal. Before the first recording render setup without chat. On ended practices render navigation and selected history without mutations. Keep unsaved result and coaching-retry recovery in the center.

Implement `activePracticeThread` as the single view-model boundary used by `PracticeSession` so the tested selection and filtering behavior cannot drift from rendering.

When New attempt or Different exercise opens setup, create a non-retry proposal with no parent. When Try again opens setup, reuse the selected attempt's exercise spec and set its ID as `parentAttemptId`.

- [ ] **Step 6: Update pattern documentation**

Mark `AttemptNavigator` established, define attempt-owned conversation ordering, and record that recording setup does not create draft attempt rows.

- [ ] **Step 7: Run focused tests, format check, and build**

Run: `yarn test lib/practice.test.ts && yarn format:check && yarn build`

Expected: PASS; the production build compiles the new interaction signatures.

- [ ] **Step 8: Commit**

```bash
git add components/practice/PracticeComposer.tsx components/practice/PracticeSession.tsx components/practice/PracticeConversation.tsx lib/practice.ts lib/practice.test.ts docs/design/components.md docs/design/patterns.md
git commit -m "feat: organize practice by attempt threads"
```

### Task 6: Compact Compass presentation and full verification

**Files:**
- Modify: `components/practice/PracticeCompass.tsx`
- Modify: `components/practice/PracticeCompass.stories.tsx`
- Create: `components/practice/PracticeCompass.test.ts`

**Interfaces:**
- Consumes: `compassForContract(contract)` from Task 1.
- Produces: exactly three compact fields with attempt-thread contextual actions.

- [ ] **Step 1: Write a failing Compass field-model test**

Export `practiceCompassFields(contract)` from the component module and test the exact presentation model:

```ts
expect(practiceCompassFields(contract)).toEqual([
  { label: "Overall trend", value: contract.compass.overallTrend },
  { label: "This session", value: contract.compass.currentSession },
  { label: "Next direction", value: contract.compass.nextDirection },
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `yarn test components/practice/PracticeCompass.test.ts`

Expected: FAIL because the three-field presentation model does not exist.

- [ ] **Step 3: Render only the compact fields**

Keep the inverse surface and responsive sticky behavior, remove confidence, focus, strength, avoidance, cue, and readiness presentation, and render the three fields from `compassForContract`. Each Explain callback sends the matching label and exact displayed sentence.

- [ ] **Step 4: Update stories**

Replace confidence variants with Generated, Legacy fallback, and Long safe-boundary fixtures. Keep the story container at the actual right-column width.

- [ ] **Step 5: Run complete verification**

Run: `yarn verify && yarn migrations:check && python -m pytest`

Expected: formatting, design-token checks, all Vitest tests, Next production build, Storybook build, migration validation, and Python tests all pass with zero failures.

- [ ] **Step 6: Review the final diff against the specification**

Confirm every acceptance criterion in `docs/superpowers/specs/2026-08-24-attempt-threaded-practice-design.md`, inspect `git diff --check`, and verify no unrelated files changed.

- [ ] **Step 7: Commit**

```bash
git add components/practice/PracticeCompass.tsx components/practice/PracticeCompass.stories.tsx components/practice/PracticeCompass.test.ts
git commit -m "feat: shorten the practice compass"
```
