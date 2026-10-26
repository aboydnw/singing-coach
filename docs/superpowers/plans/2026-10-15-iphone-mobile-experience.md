# iPhone Mobile Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed iPhone web app feel intentional and make every reference exercise audible through an iOS-reliable HTML media path.

**Architecture:** Keep the current Next.js/Chakra application and desktop layouts. Add a manifest-driven standalone shell and a shared narrow-screen tab bar, synthesize the pitch fallback into a PCM WAV blob, and route both recorded vocal references and generated pitch references through one lifecycle-aware HTML media controller. Keep `PracticeSession` as the orchestration boundary while extracting pure synthesis, media playback, and presentational state into focused modules.

**Tech Stack:** Next.js 15 App Router, React 19, Chakra UI 3, TypeScript 5.7, Vitest 3, Storybook 10, Web Audio-independent PCM WAV synthesis, HTMLAudioElement.

## Global Constraints

- Preserve the existing routes, desktop layouts, warm cream/coral/teal identity, exercise generation, recording encoding, analysis, coaching, and persistence.
- Do not add a native wrapper, full-screen wizard, fixed post-attempt dock, or unrelated chart/account redesign.
- Audio never autoplays; playback starts only from a direct user action.
- A failed reference never disables recording or the rest of practice.
- Mobile navigation touch targets are at least 44 by 44 CSS pixels and clear `env(safe-area-inset-bottom)`.
- The current recorded-vocal reference path remains preferred; only its media lifecycle and the generated pitch fallback change.
- No new runtime dependency is required.
- Every behavior change follows red-green-refactor and ends in a focused commit.

### Repository reconciliation

After the design specification was written, the product intentionally removed the exercise
acceptance step and began showing playback and recording together. This plan preserves that newer,
tested behavior instead of reintroducing an extra tap. It still satisfies the approved visual
direction: the current exercise, reference playback, and recording remain the first actionable
mobile content. This is the only deliberate difference from the specification's phrase “recording
controls after explicit exercise acceptance.”

---

## File map

- Create `lib/referenceTone.ts`: pure PCM WAV synthesis for note sequences and timed note/rest events.
- Create `lib/referenceTone.test.ts`: byte-level and signal-level synthesis contract.
- Modify `lib/referencePlayback.ts`: lifecycle-aware HTML media players for vocal URLs and generated WAV object URLs.
- Modify `lib/referencePlayback.test.ts`: source selection, start, completion, stop, fallback, and cleanup.
- Create `components/practice/ReferencePlaybackControl.tsx`: presentational Ready/Preparing/Playing/Error control.
- Create `components/practice/ReferencePlaybackControl.test.ts`: server-rendered state and accessibility contract.
- Create `components/practice/ReferencePlaybackControl.stories.tsx`: stable visual states.
- Modify `components/practice/ExerciseProposal.tsx`: use the playback-state control without owning media APIs.
- Modify `components/practice/ExerciseProposal.test.ts`: integration markup for playback and recording availability.
- Modify `components/practice/PracticeSession.tsx`: own the active player, stop it on recording/navigation/unmount, and surface failure.
- Create `app/manifest.ts`: standalone application metadata.
- Create `app/apple-icon.tsx`: generated 180px PNG response for iOS Home Screen metadata.
- Create `public/app-icon.svg`: maskable/app icon using the established cream, coral, and ink palette.
- Modify `app/layout.tsx`: viewport, theme color, Apple web-app, and icon metadata.
- Create `lib/mobileMetadata.test.ts`: import-level manifest and viewport checks plus icon existence check.
- Create `components/MobileTabBar.tsx`: reusable narrow-screen navigation.
- Create `components/MobileTabBar.test.ts`: active-route and accessible-label markup.
- Create `components/MobileTabBar.stories.tsx`: narrow-shell reference.
- Modify `components/Shell.tsx`: compact mobile top bar, desktop header preservation, safe-area content spacing, and mobile tab bar.
- Modify `components/practice/PracticeHome.tsx`: bring the actionable practice panel above editorial copy on narrow screens.
- Modify `components/practice/PracticeSession.tsx`: put draft/current work before history and move narrow exercise navigation below the work.
- Modify `components/practice/ExerciseNavigator.tsx`: expose desktop and mobile variants without duplicating behavior.
- Modify `docs/design/foundations.md`, `docs/design/components.md`, and `docs/design/patterns.md`: record the mobile-shell and reference-playback contracts.

---

### Task 1: Pure reference-tone WAV synthesis

**Files:**
- Create: `lib/referenceTone.ts`
- Create: `lib/referenceTone.test.ts`
- Modify: `lib/toneGen.ts`

**Interfaces:**
- Consumes: MIDI note numbers, `durationPerNoteS`, and `ExerciseSpec["events"]` note/rest timing.
- Produces: `midiToHz(midi: number): number`, `renderSequenceWav(notes: number[], durationPerNoteS: number, sampleRate?: number): Blob`, and `renderTimedSequenceWav(events: TimedToneEvent[], sampleRate?: number): Blob`.

- [ ] **Step 1: Write failing byte- and signal-level tests**

Create `lib/referenceTone.test.ts` with tests that read `await blob.arrayBuffer()` through `DataView` and assert:

```ts
expect(ascii(view, 0, 4)).toBe("RIFF");
expect(ascii(view, 8, 4)).toBe("WAVE");
expect(view.getUint16(22, true)).toBe(1);       // mono
expect(view.getUint32(24, true)).toBe(8_000);  // test sample rate
expect(view.getUint16(34, true)).toBe(16);      // PCM16
expect(view.getUint32(40, true)).toBe(8_000);  // one second of mono PCM16
expect(blob.type).toBe("audio/wav");
```

Add focused assertions that A4 produces positive and negative samples, the first and final samples are zero, two notes occupy their expected halves, and a timed rest contains only zero samples. Keep the small `8_000` Hz fixture so tests remain fast.

- [ ] **Step 2: Run the new test and verify RED**

Run: `yarn test lib/referenceTone.test.ts`

Expected: FAIL because `@/lib/referenceTone` does not exist.

- [ ] **Step 3: Implement deterministic PCM16 WAV rendering**

Create `lib/referenceTone.ts` with a `44`-byte RIFF/WAVE header, mono `16`-bit little-endian samples, a default `44_100` Hz sample rate, `0.5` peak amplitude, and a `10` ms linear attack/release. Use one shared internal renderer:

```ts
export type TimedToneEvent =
  | { kind: "note"; midi: number; duration_s: number; dynamic?: number }
  | { kind: "rest"; duration_s: number };

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function renderSequenceWav(
  notes: number[],
  durationPerNoteS: number,
  sampleRate = 44_100,
): Blob {
  return renderTimedSequenceWav(
    notes.map((midi) => ({ kind: "note", midi, duration_s: durationPerNoteS })),
    sampleRate,
  );
}
```

Reject non-finite MIDI values, non-positive durations, empty sequences, and unsupported sample rates with explicit `Error` messages. Clamp `dynamic ?? 1` to `0...1`, calculate each phase from its absolute sample offset, and make rests advance the cursor without writing tone samples.

- [ ] **Step 4: Point compatibility exports at the pure module**

Modify `lib/toneGen.ts` to import and re-export `midiToHz`. Leave `playSequence` and `playTimedSequence` temporarily intact so Task 2 can replace their consumers without breaking the build mid-task.

- [ ] **Step 5: Run synthesis and existing exercise tests**

Run: `yarn test lib/referenceTone.test.ts lib/exercises.test.ts`

Expected: PASS, including exact WAV header and envelope assertions.

- [ ] **Step 6: Commit the synthesis boundary**

```bash
git add lib/referenceTone.ts lib/referenceTone.test.ts lib/toneGen.ts
git commit -m "feat: synthesize reference tones as wav"
```

---

### Task 2: Reliable HTML media playback and cleanup

**Files:**
- Modify: `lib/referencePlayback.ts`
- Modify: `lib/referencePlayback.test.ts`
- Modify: `lib/toneGen.ts`

**Interfaces:**
- Consumes: `renderSequenceWav`, `renderTimedSequenceWav`, reviewed vocal asset URLs, and injected media/object-URL dependencies.
- Produces: `ReferencePlayer = { started: Promise<ReferenceSource>; done: Promise<ReferenceSource>; stop(): void }`, where `ReferenceSource = "vocal" | "pitch_fallback"`.

- [ ] **Step 1: Replace tests with the complete lifecycle contract**

Extend `lib/referencePlayback.test.ts` so injected players have separate `started` and `done` promises. Add tests proving:

```ts
await expect(player.started).resolves.toBe("vocal");
await expect(player.done).resolves.toBe("vocal");
```

Also cover: vocal `started` rejection falls back to pitch; generated pitch uses `renderSequenceWav`; timed exercises use `renderTimedSequenceWav`; `stop()` during vocal preparation prevents fallback; media `play()` rejection reaches the fallback/error path; `pause()`, `currentTime = 0`, and `URL.revokeObjectURL()` each happen exactly once on stop, end, error, and replacement.

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run: `yarn test lib/referencePlayback.test.ts`

Expected: FAIL because the current player has no `started` promise and the pitch fallback still calls Web Audio.

- [ ] **Step 3: Implement an injected HTML media player factory**

In `lib/referencePlayback.ts`, define:

```ts
export type ReferenceSource = "vocal" | "pitch_fallback";
export type ReferencePlayer = {
  started: Promise<ReferenceSource>;
  done: Promise<ReferenceSource>;
  stop: () => void;
};

type MediaLike = Pick<HTMLAudioElement, "play" | "pause" | "currentTime" | "addEventListener">;
type BrowserDependencies = {
  createAudio: (src: string) => MediaLike;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};
```

Create one internal `playMedia(src, cleanup, dependencies)` function. Its `started` promise resolves only after `audio.play()` resolves. Its `done` promise resolves on `ended` or intentional stop, rejects on media error, pauses and resets on stop, and runs cleanup exactly once.

- [ ] **Step 4: Route generated pitch through WAV object URLs**

Keep reviewed matching vocal assets first. If no vocal exists or vocal start fails, render the exercise to a WAV blob, call `URL.createObjectURL(blob)`, and use the same media factory. If stopped before fallback starts, do not construct or play the fallback. Preserve the current transposition and reviewed-asset selection rules.

- [ ] **Step 5: Remove production Web Audio playback**

After all callers use `playReference`, remove `playSequence` and `playTimedSequence` from `lib/toneGen.ts`; retain only the documented `midiToHz` re-export if current tests or callers need it. Confirm with:

Run: `rg -n "AudioContext|playSequence|playTimedSequence" app components lib -g '!*.test.ts'`

Expected: no production `AudioContext` reference and no obsolete playback caller.

- [ ] **Step 6: Run playback and full unit tests**

Run: `yarn test lib/referenceTone.test.ts lib/referencePlayback.test.ts`

Expected: PASS with no unhandled rejection output.

Run: `yarn test`

Expected: all existing tests PASS.

- [ ] **Step 7: Commit reliable media playback**

```bash
git add lib/referencePlayback.ts lib/referencePlayback.test.ts lib/toneGen.ts
git commit -m "fix: play pitch references reliably on iphone"
```

---

### Task 3: Honest playback UI and recording coordination

**Files:**
- Create: `components/practice/ReferencePlaybackControl.tsx`
- Create: `components/practice/ReferencePlaybackControl.test.ts`
- Create: `components/practice/ReferencePlaybackControl.stories.tsx`
- Modify: `components/practice/ExerciseProposal.tsx`
- Modify: `components/practice/ExerciseProposal.test.ts`
- Modify: `components/practice/ExerciseProposal.stories.tsx`
- Modify: `components/practice/PracticeSession.tsx`

**Interfaces:**
- Consumes: `PlaybackState = "ready" | "preparing" | "playing" | "error"`, `referenceFallback`, `disabled`, `onPlay`, and `onStop`.
- Produces: a presentational accessible playback control; `PracticeSession` remains the sole owner of `ReferencePlayer` and orchestration.

- [ ] **Step 1: Write failing state-rendering tests**

Use the existing Chakra `renderToStaticMarkup` pattern. Assert exact user-visible behavior:

```ts
expect(renderControl("ready")).toContain("Hear reference");
expect(renderControl("preparing")).toContain("Preparing sound…");
expect(renderControl("playing")).toContain("Stop reference");
expect(renderControl("error")).toContain("Reference sound couldn’t play");
expect(renderControl("error")).toContain("Retry");
```

Assert the status region uses `role="status"`, fallback copy says `Vocal example unavailable—playing pitch guide`, and Ready/Error do not render a false playing status.

- [ ] **Step 2: Run component tests and verify RED**

Run: `yarn test components/practice/ReferencePlaybackControl.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the presentational control and stories**

Render one Chakra `Button` plus concise status/error text. Preparing disables duplicate starts. Playing changes the same control into Stop. Error keeps recording available and changes the primary label to Retry. Add Ready, Preparing, Playing, Fallback, and Error stories using the production provider.

- [ ] **Step 4: Replace ExerciseProposal's boolean playback API**

Replace `playing: boolean` and `onHear` with:

```ts
playbackState: "ready" | "preparing" | "playing" | "error";
onPlayReference: () => void;
onStopReference: () => void;
```

Render `ReferencePlaybackControl` immediately before `Recorder`. Update `ExerciseProposal.test.ts` to assert playback remains present alongside Record in Ready and Error states.

- [ ] **Step 5: Orchestrate player lifecycle in PracticeSession**

Replace `playing` with `playbackState` and add `activeReferenceRef = useRef<ReferencePlayer | null>(null)`. The play handler must:

```ts
setPlaybackState("preparing");
const player = playReference(proposal.spec);
activeReferenceRef.current = player;
const source = await player.started;
setReferenceFallback(source === "pitch_fallback");
setPlaybackState("playing");
await player.done;
if (activeReferenceRef.current === player) {
  activeReferenceRef.current = null;
  setPlaybackState("ready");
}
```

Catch failures into `error` without changing recorder availability. Stop the current player before starting another, when Cancel/New Exercise/navigation runs, and in effect cleanup. When `RecorderState` enters `requesting` or `recording`, stop playback before saving the new recorder state.

- [ ] **Step 6: Run focused and full tests**

Run: `yarn test components/practice/ReferencePlaybackControl.test.ts components/practice/ExerciseProposal.test.ts lib/referencePlayback.test.ts components/Recorder.test.ts`

Expected: PASS.

Run: `yarn test`

Expected: all tests PASS with no open timers or rejected promises.

- [ ] **Step 7: Commit playback interaction states**

```bash
git add components/practice/ReferencePlaybackControl.tsx components/practice/ReferencePlaybackControl.test.ts components/practice/ReferencePlaybackControl.stories.tsx components/practice/ExerciseProposal.tsx components/practice/ExerciseProposal.test.ts components/practice/ExerciseProposal.stories.tsx components/practice/PracticeSession.tsx
git commit -m "feat: show reliable reference playback states"
```

---

### Task 4: Installable standalone metadata and icon

**Files:**
- Create: `app/manifest.ts`
- Create: `app/apple-icon.tsx`
- Create: `public/app-icon.svg`
- Create: `lib/mobileMetadata.test.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: established palette values `#FFF8EF`, `#D64B2A`, and `#3D2C29` for platform metadata/assets only.
- Produces: Next.js `MetadataRoute.Manifest`, exported `viewport: Viewport`, and discoverable application icons.

- [ ] **Step 1: Write failing metadata tests**

Import the manifest function and `viewport` and assert:

```ts
expect(manifest().display).toBe("standalone");
expect(manifest().start_url).toBe("/practice");
expect(manifest().theme_color).toBe("#FFF8EF");
expect(manifest().icons).toEqual(
  expect.arrayContaining([expect.objectContaining({ src: "/app-icon.svg", purpose: "any maskable" })]),
);
expect(viewport.viewportFit).toBe("cover");
expect(viewport.themeColor).toBe("#FFF8EF");
expect(existsSync(resolve("public/app-icon.svg"))).toBe(true);
expect(existsSync(resolve("app/apple-icon.tsx"))).toBe(true);
```

- [ ] **Step 2: Run metadata tests and verify RED**

Run: `yarn test lib/mobileMetadata.test.ts`

Expected: FAIL because the manifest, viewport export, and icon do not exist.

- [ ] **Step 3: Add manifest and platform metadata**

Create `app/manifest.ts` returning name `Singing Coach`, short name `Coach`, description matching root metadata, `start_url: "/practice"`, `display: "standalone"`, `background_color: "#FFF8EF"`, `theme_color: "#FFF8EF"`, and the SVG icon with `sizes: "any"`, `type: "image/svg+xml"`, `purpose: "any maskable"`.

In `app/layout.tsx`, export `viewport` with `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, and matching theme color. Extend `metadata` with `applicationName`, `manifest: "/manifest.webmanifest"`, `icons`, and `appleWebApp: { capable: true, statusBarStyle: "default", title: "Singing Coach" }`.

- [ ] **Step 4: Create the icon asset**

Add a square SVG with a cream field, coral outer singing-ring mark, and ink center. Give it a generous safe margin so maskable cropping does not remove the mark. Add `app/apple-icon.tsx` using Next.js `ImageResponse` with `export const size = { width: 180, height: 180 }` and `export const contentType = "image/png"`; reproduce the same simple ring mark with platform-metadata color literals. This gives iOS a real PNG without committing an opaque generated binary.

- [ ] **Step 5: Run metadata test and production build**

Run: `yarn test lib/mobileMetadata.test.ts`

Expected: PASS.

Run: `yarn build`

Expected: build succeeds and lists `/manifest.webmanifest`.

- [ ] **Step 6: Commit installable metadata**

```bash
git add app/manifest.ts app/apple-icon.tsx app/layout.tsx public/app-icon.svg lib/mobileMetadata.test.ts
git commit -m "feat: add standalone iphone web app metadata"
```

---

### Task 5: Mobile top bar, bottom navigation, and safe areas

**Files:**
- Create: `components/MobileTabBar.tsx`
- Create: `components/MobileTabBar.test.ts`
- Create: `components/MobileTabBar.stories.tsx`
- Modify: `components/Shell.tsx`
- Modify: `lib/theme.ts`

**Interfaces:**
- Consumes: `currentPath: string` and the existing four route definitions.
- Produces: `MobileTabBar({ currentPath }: { currentPath: string })`, visible below the desktop breakpoint.

- [ ] **Step 1: Write failing navigation markup tests**

Render with `currentPath="/practice/example"` and assert four links, Practice with `aria-current="page"`, readable labels, and a non-color active marker. Render `/account` and assert only Account is current. Keep routing logic pure by passing the pathname into the component.

- [ ] **Step 2: Run the navigation test and verify RED**

Run: `yarn test components/MobileTabBar.test.ts`

Expected: FAIL because `MobileTabBar` does not exist.

- [ ] **Step 3: Implement the tab bar and representative story**

Use Chakra layout and simple typographic symbols already supported by the app; do not add an icon package. Each link has `minH="11"`, visible label, `aria-current`, and a `3px` active top marker. Fix it to the bottom with `pb="env(safe-area-inset-bottom)"`, `bg="bg.overlay"`, `backdropFilter="blur(14px)"`, and the existing overlay shadow.

- [ ] **Step 4: Integrate responsive shell chrome**

In `Shell`, keep the existing header at `display={{ base: "none", md: "block" }}`. Add a compact mobile top bar at `display={{ base: "block", md: "none" }}` with top safe-area padding and the product name. Render `MobileTabBar` after the footer. Add enough narrow-screen bottom padding to `main` to clear the bar plus `env(safe-area-inset-bottom)`; reset it at `md`.

Add semantic `sizes.mobileNav` or an equivalent documented token to `lib/theme.ts` rather than scattering the reserved height.

- [ ] **Step 5: Run navigation, design, and build checks**

Run: `yarn test components/MobileTabBar.test.ts`

Expected: PASS.

Run: `yarn design:check`

Expected: `Design value check passed.`

Run: `yarn build`

Expected: PASS without hydration or metadata errors.

- [ ] **Step 6: Commit mobile shell navigation**

```bash
git add components/MobileTabBar.tsx components/MobileTabBar.test.ts components/MobileTabBar.stories.tsx components/Shell.tsx lib/theme.ts
git commit -m "feat: add iphone navigation shell"
```

---

### Task 6: Mobile-first practice reading order

**Files:**
- Modify: `components/practice/PracticeHome.tsx`
- Modify: `components/practice/PracticeSession.tsx`
- Modify: `components/practice/ExerciseNavigator.tsx`
- Modify: `components/practice/ExerciseNavigator.test.ts`
- Modify: `components/practice/ExerciseProposal.stories.tsx`

**Interfaces:**
- Consumes: existing practice state and callbacks without changing persistence.
- Produces: actionable-first narrow layouts while preserving the existing `lg` three-column layout.

- [ ] **Step 1: Add failing responsive-contract assertions**

Extend `ExerciseNavigator.test.ts` to render explicit `variant="desktop"` and `variant="mobile"`. Assert desktop uses direct exercise buttons, mobile uses the labeled native select, both expose New Exercise when active, and ended practice hides it.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `yarn test components/practice/ExerciseNavigator.test.ts`

Expected: FAIL because `ExerciseNavigator` has no explicit variant.

- [ ] **Step 3: Split ExerciseNavigator presentation by variant**

Add `variant: "desktop" | "mobile"` and render exactly one presentation per instance. Preserve current selection, disabled state, draft option, summaries, and ended behavior. This allows `PracticeSession` to place the mobile selector after current work without CSS source-order tricks or duplicated business logic.

- [ ] **Step 4: Reorder Practice home on narrow screens**

Give the editorial intro, actionable grid, and recent-practice section responsive `order` values so the actionable grid is first at `base` and the current desktop sequence returns at `lg`. Keep errors directly before the actionable grid and retain existing copy and data behavior.

- [ ] **Step 5: Reorder active practice on narrow screens**

Render the desktop navigator only in the left `lg` column. In the central stack, give an open `ExerciseProposal` responsive priority so the current draft appears before historical attempts on narrow screens while retaining desktop sequence. Render the mobile navigator after the central stack and before the Compass in narrow flow. Do not change attempt persistence, selected exercise IDs, streaming, or composer behavior.

- [ ] **Step 6: Validate practice behavior and responsive stories**

Run: `yarn test components/practice/ExerciseNavigator.test.ts components/practice/ExerciseProposal.test.ts lib/exerciseThreads.test.ts lib/practice.test.ts`

Expected: PASS.

Run: `yarn storybook:build`

Expected: PASS with ExerciseProposal and MobileTabBar stories rendered.

- [ ] **Step 7: Commit the mobile practice hierarchy**

```bash
git add components/practice/PracticeHome.tsx components/practice/PracticeSession.tsx components/practice/ExerciseNavigator.tsx components/practice/ExerciseNavigator.test.ts components/practice/ExerciseProposal.stories.tsx
git commit -m "feat: prioritize current practice on mobile"
```

---

### Task 7: Design documentation and release verification

**Files:**
- Modify: `docs/design/foundations.md`
- Modify: `docs/design/components.md`
- Modify: `docs/design/patterns.md`

**Interfaces:**
- Consumes: the implemented shell, playback, and practice contracts.
- Produces: repository-authoritative guidance plus a clean verified release candidate.

- [ ] **Step 1: Update design foundations**

Document that the mobile shell owns top/bottom safe areas, content reserves the shared mobile navigation height, active navigation needs text plus a structural marker, and feature pages must not duplicate shell inset padding.

- [ ] **Step 2: Update component and pattern contracts**

Add `MobileTabBar` and `ReferencePlaybackControl` to the catalogue. Update `ExerciseProposal` to name Ready/Preparing/Playing/Error reference states. Document that reference audio stops before microphone capture and that narrow practice prioritizes current work before exercise history and Compass context.

- [ ] **Step 3: Run formatting and the full verification suite**

Run: `yarn format`

Expected: Prettier updates only files in scope.

Run: `yarn verify`

Expected: formatting, design check, all Vitest tests, Next.js production build, and Storybook build PASS.

- [ ] **Step 4: Inspect the final diff and repository state**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the three documentation files are uncommitted after earlier task commits.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/design/foundations.md docs/design/components.md docs/design/patterns.md
git commit -m "docs: define iphone interaction contracts"
```

- [ ] **Step 6: Perform the user-owned physical iPhone acceptance pass**

After deployment, ask the user to remove the prior Home Screen shortcut, reinstall it, and complete the eleven-step checklist in the approved specification: standalone launch, safe areas, first playback, stop/replay, background/reopen playback, playback-to-recording handoff, full attempt, all tabs, keyboard reachability, and rotation. Record any failed step as a new reproducible issue; do not claim physical-device completion from automated checks.
