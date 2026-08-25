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

Shared components own repeated accessibility, state, and visual behavior. Page-specific grid and
composition stay local.

## Practice components

| Component              | Status      | Supported responsibility                                                  |
| ---------------------- | ----------- | ------------------------------------------------------------------------- |
| `PracticeHome`         | Provisional | Start/resume composition and recent practice                              |
| `PracticeCompass`      | Provisional | Current learning contract and contextual questions                        |
| `ExerciseProposal`     | Provisional | Proposed, accepted, processing, retry, and free-sing states               |
| `AttemptResult`        | Provisional | Immutable assessment and progressive analysis disclosure                  |
| `PracticeMessage`      | Provisional | One persisted message rendered inline in an exercise timeline             |
| `StreamingPracticeMessage` | Provisional | The live assistant message and streaming cursor rendered inline       |
| `PracticeComposer`     | Provisional | Exercise-scoped question entry, retry, and new-exercise shortcuts          |
| `ExerciseNavigator`    | Established | Exercise-thread selection, summaries, draft state, and new exercise entry |
| `PlasticityLoop`       | Candidate   | Parent/retry relationship currently represented by attempt metadata       |
| `Recorder`             | Established | Microphone, encoding, upload, retry, and error lifecycle                  |

`PracticeMessage` and `StreamingPracticeMessage` are inline timeline renderers rather than a
conversation wrapper. `PracticeSession` interleaves them with attempt cards inside the selected
exercise's live-region stack.

`PracticeComposer` is inline and exercise-scoped. It owns the question input plus the Try again and
Try a different exercise footer actions; it does not float over the page. Contextual questions are
available only for persisted sources whose source attempt belongs to the selected exercise.

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
