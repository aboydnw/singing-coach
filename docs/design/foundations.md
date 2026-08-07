# Foundations

`lib/theme.ts` is authoritative for product-interface foundations. Primitive palette names describe
color families; semantic names describe why a value is used. New feature code should prefer the
semantic name.

## Color roles

| Semantic role      | Meaning                                       |
| ------------------ | --------------------------------------------- |
| `bg.canvas`        | Application background                        |
| `bg.surface`       | Default content surface                       |
| `bg.subtle`        | Nested or quiet surface                       |
| `bg.inverse`       | High-contrast coaching surface                |
| `fg.default`       | Primary text                                  |
| `fg.muted`         | Secondary text and metadata                   |
| `fg.inverse`       | Text on inverse surfaces                      |
| `border.default`   | Structural separation                         |
| `border.focus`     | Keyboard and active focus                     |
| `action.primary`   | Main action in the current decision           |
| `action.secondary` | Singer-controlled alternative action          |
| `feedback.danger`  | Error, destructive, or caution state          |
| `feedback.success` | Confirmed successful state                    |
| `coaching.focus`   | The single coaching emphasis                  |
| `singer.agency`    | Singer choice, question context, and progress |

Coral and teal are not interchangeable status colors: coral carries coaching focus and primary
action; teal carries singer agency and confirmed progress. Danger and success aliases make status
intent explicit.

## Surface and depth

- `surface.base`: ordinary content, no shadow.
- `surface.raised`: the current actionable object, warm tinted shadow.
- `surface.overlay`: sticky translucent chrome.
- `surface.inverse`: persistent coach orientation.

Inner elements use a tighter radius than their parent. Elevation communicates current action, not
general decoration.

## Typography

- Display headings use tight tracking and balanced wrapping.
- Body prose should remain near 65 characters per line and use generous line height.
- Labels use medium or semibold weight; small uppercase is reserved for semantic eyebrows.
- Measurements use tabular figures.
- Sentence case is the default for controls and headings.

## Motion

Use motion to explain state changes. The shared durations are `fast` (120ms), `normal` (180ms), and
`slow` (260ms). Animate opacity and transforms. Respect `prefers-reduced-motion`; no essential state
may depend on animation.

## Focus and accessibility

Interactive elements require a visible focus ring using `border.focus`. Color never carries status
alone. Audio never autoplays. Streaming text uses one live-region completion announcement rather
than announcing every token.

## Responsive behavior

- Desktop practice uses timeline plus sticky Compass.
- Mobile practice uses one content column; controls wrap or stack without horizontal scrolling.
- Primary actions remain visible and use full width when two buttons no longer fit.
- Fixed composers must reserve page-bottom space and respect safe-area insets.

## Chart exception

Recharts requires concrete color strings. Those values live in `lib/chartTheme.ts`, not in feature
components and not under product action roles.
