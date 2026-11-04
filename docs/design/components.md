# Component catalogue

## Shared UI

| Component        | Status      | Contract                                                           |
| ---------------- | ----------- | ------------------------------------------------------------------ |
| `AppNotice`      | Established | Error, warning, success, information, and partial-success feedback |
| `Eyebrow`        | Established | Semantic section label with consistent tracking and tone           |
| `Surface`        | Established | Base, raised, subtle, and inverse content surfaces                 |
| `StatusLabel`    | Established | Text-plus-color lifecycle status                                   |
| `EmptyState`     | Established | Composed empty state with optional action                          |
| `LoadingSurface` | Established | Shape-matched panel loading state                                  |
| `ContextAction`  | Established | Consistent contextual explanation affordance                       |
| `MobileTabBar`   | Established | Safe-area-aware mobile bottom navigation                           |

Shared components own repeated accessibility, state, and visual behavior. Page-specific grid and
composition stay local.

## Auth components

| Component              | Status      | Supported responsibility                                          |
| ---------------------- | ----------- | ----------------------------------------------------------------- |
| `AuthCard`             | Provisional | Centered frame for every signed-out screen                        |
| `SignInPanel`          | Provisional | Google sign-in, with an optional email fallback (`?signin=email`) |
| `DeleteAccountSection` | Provisional | Account danger zone with a typed confirmation dialog              |

`AuthGate` owns the Supabase calls and passes plain-language notices down; the auth components stay
presentational so Storybook and tests can render them without a session. Error copy comes from
`lib/authMessages.ts`, never from raw Supabase messages.

`AppFooter` sits at the bottom of the signed-in shell, the sign-in card, and the public privacy page. It
links the privacy policy and source code and shows the running build (short commit and build date,
injected in `next.config.ts` from Vercel's `VERCEL_GIT_COMMIT_SHA`).

## Practice components

| Component                  | Status      | Supported responsibility                                                  |
| -------------------------- | ----------- | ------------------------------------------------------------------------- |
| `PracticeHome`             | Provisional | Start/resume composition and recent practice                              |
| `PracticeCompass`          | Provisional | Current learning contract and contextual questions                        |
| `ExerciseProposal`         | Provisional | Proposed, accepted, processing, retry, and free-sing states               |
| `AttemptResult`            | Provisional | Immutable assessment and progressive analysis disclosure                  |
| `PracticeMessage`          | Provisional | One persisted message rendered inline in an exercise timeline             |
| `StreamingPracticeMessage` | Provisional | The live assistant message and streaming cursor rendered inline           |
| `PracticeComposer`         | Provisional | Exercise-scoped question entry, retry, and new-exercise shortcuts         |
| `ExerciseNavigator`        | Established | Exercise-thread selection, summaries, draft state, and new exercise entry |
| `PlasticityLoop`           | Candidate   | Parent/retry relationship currently represented by attempt metadata       |
| `Recorder`                 | Established | Microphone, encoding, upload, retry, and error lifecycle                  |
| `PendingAttempt`           | Provisional | Persisted upload, analysis, coaching, and retry status                    |
| `PracticeActionWorkspace`  | Provisional | Coaching focus, reference, recording, and practice exit actions           |
| `AttemptSummaryCard`       | Provisional | Compact attempt index entry linking to dedicated review                   |
| `AttemptDetail`            | Provisional | One attempt's analysis and strictly owned coaching conversation           |
| `BackToPracticeControls`   | Provisional | Return to recording controls after scrolling into attempt history         |

`PracticeMessage` and `StreamingPracticeMessage` render only inside an attempt detail conversation,
except for legacy null-attempt messages shown read-only under General practice questions.

`PracticeComposer` is attempt-scoped on the detail route. It can omit practice actions when the
sticky attempt navigation already provides Try again. Contextual questions always persist the
attempt displayed by that route.

`PracticeActionWorkspace` is the first substantial surface in an active practice. It owns the
short coaching recap, current proposal, reference playback, recorder, durable pending state,
Different exercise, and End practice. `AttemptSummaryCard` entries follow below, newest first.

`AttemptDetail` owns full analysis and conversation for exactly one attempt. Its sticky navigation
returns to the practice or deep-links that attempt into the retry-ready workspace.

`PendingAttempt` replaces the recorder inside the action workspace while durable work runs. It may
say navigation is safe only after the durable endpoint acknowledges the uploaded recording. Its
waiting guidance is short, comes from saved practice context, and never invites another recording.

`MobileTabBar` uses text plus line icons for four equal-width destinations. Targets are at least
48 CSS pixels high, account for the device safe area, and expose the active destination with a
compact tinted icon capsule plus `aria-current="page"`. The active destination must not become a
larger card or shift its label baseline; the desktop shell uses the same destination labels.

`ExerciseNavigator` groups retries under their root exercise. Recorded exercises show the root
exercise name, total attempt count, and latest outcome; a pending proposal appears once as a Draft
exercise with its stable draft ID. Desktop uses direct exercise controls and narrow layouts use a
labeled Exercise selector. Selection controls are disabled while work is in progress, and ended
practice hides the new-exercise action without removing recorded navigation.

## Abstraction rule

Centralize behavior when it repeats, changes frequently, or carries accessibility risk. Do not wrap
every Chakra `Box`, `Flex`, or `Stack`. A one-off page arrangement remains easier to understand when
kept in its feature.

## Adding a component

A reusable component must define:

- semantic purpose;
- supported variants and defaults;
- loading, empty, disabled, success, warning, error, and destructive states where relevant;
- keyboard and focus behavior;
- narrow-layout and long-content behavior;
- stable Storybook fixture;
- behavior test when it owns interaction rather than presentation only.
