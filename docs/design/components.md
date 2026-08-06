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

| Component              | Status      | Supported responsibility                                            |
| ---------------------- | ----------- | ------------------------------------------------------------------- |
| `PracticeHome`         | Provisional | Start/resume composition and recent practice                        |
| `PracticeCompass`      | Provisional | Current learning contract and contextual questions                  |
| `ExerciseProposal`     | Provisional | Proposed, accepted, processing, retry, and free-sing states         |
| `AttemptResult`        | Provisional | Immutable assessment and progressive analysis disclosure            |
| `PracticeConversation` | Provisional | Persisted and streaming contextual messages                         |
| `PracticeComposer`     | Provisional | Global/contextual question entry and session shortcuts              |
| `PlasticityLoop`       | Candidate   | Parent/retry relationship currently represented by attempt metadata |
| `Recorder`             | Established | Microphone, encoding, upload, retry, and error lifecycle            |
| `ExerciseFlow`         | Deprecated  | Replaced by Practice routes; retain only until migration cleanup    |

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
