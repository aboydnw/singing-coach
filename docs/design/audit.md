# Design audit and parity

Last reviewed: 2026-08-06.

## Classification

- **Core system:** semantic theme, shared feedback, action hierarchy, focus, motion.
- **Intentional variation:** inverse Coach surfaces versus ordinary product surfaces.
- **Authored/data-driven:** model coaching prose and measurement values.
- **Rendering constraint:** Recharts concrete color strings.
- **Consolidation candidate:** Plasticity Loop comparison and mobile Compass sheet.
- **Local one-off:** Practice landing composition and calibration note grid.

## Parity inventory

| Capability            | Code                                       | Tokens            | States                                | Docs        | Status      |
| --------------------- | ------------------------------------------ | ----------------- | ------------------------------------- | ----------- | ----------- |
| Application shell     | `components/Shell.tsx`                     | Semantic          | Active route                          | Foundations | Established |
| Practice start/resume | `PracticeHome`                             | Semantic          | Loading, empty, active, error         | Patterns    | Provisional |
| Coach snapshot        | `CoachSnapshot`                            | Semantic          | Early/history                         | Components  | Provisional |
| Practice Compass      | `PracticeCompass`                          | Semantic          | Confidence, optional fields           | Patterns    | Provisional |
| Exercise proposal     | `ExerciseProposal`                         | Semantic          | Proposed, accepted, retry, processing | Patterns    | Provisional |
| Attempt result        | `AttemptResult`                            | Semantic + chart  | Initial, retry, expanded              | Patterns    | Provisional |
| Contextual coaching   | `PracticeConversation`, `PracticeComposer` | Semantic          | Anchored, streaming, stopped, error   | Patterns    | Provisional |
| Recorder              | `Recorder`                                 | Semantic          | Full media lifecycle                  | Components  | Established |
| Scorecard             | `Scorecard`                                | Product + data    | Missing and scored values             | Components  | Established |
| Charts                | `PitchChart`, `ProgressCharts`             | `chartTheme`      | Empty and populated                   | Foundations | Exception   |
| Old exercise flow     | `ExerciseFlow`                             | Legacy primitives | Historical                            | Components  | Deprecated  |

## Review questions

1. Is a new value primitive, semantic, authored, data-driven, or a rendering exception?
2. Does an existing component or pattern already own the behavior?
3. Are loading, empty, disabled, partial, error, and destructive states covered?
4. Does the change work with keyboard, long content, and narrow layouts?
5. If a shared contract changed, did its story, test, and documentation move with it?
6. If this is an exception, is its reason and owner recorded here?

## Health signals

Track high-use component parity, unexplained product color literals, deprecated usage, shared-state
coverage, and stale Storybook contracts. These are investigation signals, not percentage targets.
