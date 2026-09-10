# Variety and Direct Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unexplained exercise repetition across practices and let singers hear or record a proposed exercise without an extra acceptance click.

**Architecture:** Add a pure selection module that ranks deterministic exercise candidates against persisted attempt history. Keep proposal orchestration in `PracticeSession`, but move novelty policy out of that component. Flatten `ExerciseProposal` into one stable control state in which reference playback and recording are peers.

**Tech Stack:** TypeScript, React 19, Next.js 15, Chakra UI 3, Vitest, Supabase-backed session history.

## Global Constraints

- Range-dependent proposals require calibration.
- Repeating an exercise is valid when the singer explicitly chooses `Try again`.
- Automatic proposals must consider attempts from earlier practices.
- Novelty is evaluated by exact notes and by exercise shape, not display name alone.
- Recording and reference playback are available immediately; recording constitutes acceptance.
- Existing recording, upload, analysis, retry, draft, and navigation safeguards remain intact.

---

## File structure

- Create `lib/exerciseSelection.ts`: pure candidate construction, signature extraction, and novelty ranking.
- Create `lib/exerciseSelection.test.ts`: focused selection-policy tests.
- Modify `components/practice/PracticeSession.tsx`: load recent history for automatic proposals and remove acceptance state.
- Modify `components/practice/ExerciseProposal.tsx`: render playback and recorder in one stable setup state.
- Modify `components/practice/ExerciseProposal.stories.tsx`: remove obsolete accepted-state stories and props.
- Modify `components/practice/ContextualAsk.test.ts`: update the proposal fixture contract.
- Create `components/practice/ExerciseProposal.test.ts`: assert direct access to playback and recording controls.

### Task 1: Cross-practice novelty ranking

**Files:**
- Create: `lib/exerciseSelection.ts`
- Create: `lib/exerciseSelection.test.ts`
- Read: `lib/exercises.ts`
- Read: `lib/sessions.ts`

**Interfaces:**
- Consumes: `Calibration`, `ExerciseSpec`, `FocusArea`, and persisted rows containing `exercise_spec_json`.
- Produces: `selectVariedExercise(args: VariedExerciseArgs): { spec: ExerciseSpec; index: number }`.
- Produces: `exerciseSignature(spec: ExerciseSpec): string`.

- [ ] **Step 1: Write failing ranking tests**

```ts
it("avoids the exact exercises used in recent practices", () => {
  const history = [row(nextExercise(CALIBRATION, 0)), row(nextExercise(CALIBRATION, 1))];
  const selected = selectVariedExercise({
    calibration: CALIBRATION,
    cursor: 0,
    focusArea: null,
    history,
  });
  expect(history.map(parsedSignature)).not.toContain(exerciseSignature(selected.spec));
});

it("penalizes an overused shape while retaining a relevant focused candidate", () => {
  const selected = selectVariedExercise({
    calibration: CALIBRATION,
    cursor: 0,
    focusArea: "pitch_accuracy",
    history: [row(nextExercise(CALIBRATION, 0)), row(nextExercise(CALIBRATION, 4))],
  });
  expect(selected.spec.type).toBe("scale");
  expect(exerciseSignature(selected.spec)).not.toBe(exerciseSignature(nextExercise(CALIBRATION, 0)));
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `yarn test lib/exerciseSelection.test.ts`

Expected: FAIL because `lib/exerciseSelection.ts` does not exist.

- [ ] **Step 3: Implement deterministic candidate ranking**

```ts
export type VariedExerciseArgs = {
  calibration: Calibration;
  cursor: number;
  focusArea: FocusArea | null;
  preferredType?: ExerciseSpec["type"] | null;
  drillName?: string | null;
  history: Array<Pick<SessionRow, "exercise_spec_json">>;
};

export function exerciseSignature(spec: ExerciseSpec): string {
  return `${spec.type}:${spec.target_notes_midi.join(",")}:${spec.vowel}`;
}

export function selectVariedExercise(args: VariedExerciseArgs) {
  const recent = parseRecentSpecs(args.history).slice(0, 12);
  const hardExcluded = new Set(recent.slice(0, 2).map(exerciseSignature));
  const candidates = buildCandidates(args.calibration, args.cursor, args.focusArea);
  const eligible = candidates.filter(({ spec }) => !hardExcluded.has(exerciseSignature(spec)));
  return (eligible.length ? eligible : candidates).sort(
    (a, b) => score(b, recent, args.focusArea) - score(a, recent, args.focusArea) || a.index - b.index,
  )[0];
}
```

Build sixteen deterministic candidates. Include preferred-drill-type candidates, focus-targeted candidates at successive pitch-walk positions, and untargeted rotation candidates. When `drillName` accompanies `preferredType`, retain it in the selected preferred candidate's display suffix. Score preferred type and focus relevance positively, subtract exact-use and type-frequency penalties, and use the lowest candidate index as the stable tie-breaker. Ignore null, malformed, and Free Sing specifications.

- [ ] **Step 4: Run ranking tests**

Run: `yarn test lib/exerciseSelection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the selection module**

```bash
git add lib/exerciseSelection.ts lib/exerciseSelection.test.ts
git commit -m "feat: vary exercises across practices"
```

### Task 2: Use persisted history for every automatic proposal

**Files:**
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `lib/exerciseSelection.test.ts`

**Interfaces:**
- Consumes: `selectVariedExercise`, `listSessions(30)`, current learning-contract focus, and proposal cursor.
- Preserves: explicit retry behavior and the existing `skipFromCursor` behavior for a singer-requested different exercise.

- [ ] **Step 1: Add a failing regression test for proposal inputs**

Add a pure helper test proving that rows from a different `practice_session_id` still affect automatic selection. Use a recent exact match from an earlier practice and assert that the selected signature differs.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `yarn test lib/exerciseSelection.test.ts`

Expected: FAIL until selection consumes all supplied rows without filtering by practice ID.

- [ ] **Step 3: Integrate selection into initial and next proposals**

In `PracticeSession`, load `listSessions(30)` immediately before an automatic calibrated proposal. Call:

```ts
const selected = selectVariedExercise({
  calibration,
  cursor: bundle.attempts.length,
  focusArea: contract?.focusArea ?? null,
  history: recentSessions,
});
```

For a latest resolved drill with an `exercise_type`, pass `preferredType` and `drillName` to the selector rather than bypassing novelty ranking with `exerciseForDrill`. Do not change `retrySelected`, because retry is singer-authorized repetition.

- [ ] **Step 4: Run exercise and practice tests**

Run: `yarn test lib/exerciseSelection.test.ts lib/exercises.test.ts lib/practice.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit proposal integration**

```bash
git add components/practice/PracticeSession.tsx lib/exerciseSelection.ts lib/exerciseSelection.test.ts
git commit -m "feat: use practice history for exercise proposals"
```

### Task 3: Remove the redundant acceptance state

**Files:**
- Modify: `components/practice/ExerciseProposal.tsx`
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/ExerciseProposal.stories.tsx`
- Modify: `components/practice/ContextualAsk.test.ts`
- Create: `components/practice/ExerciseProposal.test.ts`

**Interfaces:**
- Removes: `accepted: boolean` and `onAccept: () => void` from `ExerciseProposal`.
- Preserves: `onUploaded`, `onHear`, `onDifferent`, `onFreeSing`, `onMoveOn`, `onCancel`, and recorder-state reporting.

- [ ] **Step 1: Write a failing component-structure test**

```ts
it("offers playback and recording without an acceptance step", () => {
  const tree = ExerciseProposal(baseProps);
  expect(buttonLabels(tree)).toContain("Hear example");
  expect(componentNames(tree)).toContain("Recorder");
  expect(buttonLabels(tree)).not.toContain("Start this exercise");
});
```

Use the repository's existing React-element traversal style from `ContextualAsk.test.ts`; do not introduce a DOM test dependency.

- [ ] **Step 2: Run the component test and confirm failure**

Run: `yarn test components/practice/ExerciseProposal.test.ts`

Expected: FAIL because playback and `Recorder` are split across accepted states.

- [ ] **Step 3: Flatten the proposal UI**

Remove the accepted branch. Render one action row with `Hear example` when scored and the `Recorder` immediately after it. Keep alternative and cancel actions below. Change the playback label from `Hear it` to `Hear example`. Disable controls using the existing `playing`, `recorderBusy`, `processing`, and `proposalLoading` flags.

Remove `accepted` state and every `setAccepted` call from `PracticeSession`. Remove obsolete props and the `Accepted` Storybook story. Update existing fixtures.

- [ ] **Step 4: Run proposal and practice component tests**

Run: `yarn test components/practice/ExerciseProposal.test.ts components/practice/ContextualAsk.test.ts components/practice/ExerciseNavigator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the direct recording flow**

```bash
git add components/practice/ExerciseProposal.tsx components/practice/ExerciseProposal.test.ts components/practice/ExerciseProposal.stories.tsx components/practice/ContextualAsk.test.ts components/practice/PracticeSession.tsx
git commit -m "feat: record directly from exercise setup"
```

### Task 4: Verify the first delivery increment

**Files:**
- Modify only files required by formatter output or a concrete verification failure.

**Interfaces:**
- Produces a passing repository verification result for the completed increment.

- [ ] **Step 1: Format changed TypeScript files**

Run: `npx prettier --write lib/exerciseSelection.ts lib/exerciseSelection.test.ts components/practice/ExerciseProposal.tsx components/practice/ExerciseProposal.test.ts components/practice/ExerciseProposal.stories.tsx components/practice/ContextualAsk.test.ts components/practice/PracticeSession.tsx`

- [ ] **Step 2: Run the full test suite**

Run: `yarn test`

Expected: all tests pass.

- [ ] **Step 3: Run static and production checks**

Run: `yarn format:check && yarn design:check && yarn build && yarn storybook:build`

Expected: every command exits successfully.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff HEAD~3 --check && git status --short`

Expected: no whitespace errors; only intended files are changed.

- [ ] **Step 5: Commit formatter or verification fixes if necessary**

If verification required edits, stage only the affected files from the explicit file list in Tasks 1–3 and commit them with `git commit -m "chore: verify varied practice foundation"`. If it required no edits, do not create an empty commit.
