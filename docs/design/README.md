# Singing Coach design system

This directory is the entry point for product-interface decisions. The system is intentionally
small: semantic foundations, reusable behavior, recurring product patterns, executable examples,
and documented exceptions. It exists to help people and coding agents change the product without
copying yesterday's implementation by accident.

## Authority

| Decision                                         | Authority           | Supporting representation      |
| ------------------------------------------------ | ------------------- | ------------------------------ |
| Product meaning and usage                        | `docs/design/`      | Storybook descriptions         |
| Runtime behavior and accessibility               | Code component      | Component tests and stories    |
| Color, depth, motion, and responsive foundations | `lib/theme.ts`      | Foundations stories            |
| Chart rendering colors                           | `lib/chartTheme.ts` | Chart components               |
| Composed page intent                             | Feature component   | Screenshots and product review |
| Executable variants and states                   | Storybook           | Component documentation        |

When two sources disagree, update the supporting representation to match the authority above. A
Storybook story demonstrates a contract; it does not override the production component.

## Lifecycle labels

- **Established:** safe default for new work.
- **Provisional:** supported now, expected to evolve.
- **Candidate:** repeated pattern being evaluated for consolidation.
- **Exception:** intentional deviation with a recorded reason.
- **Deprecated:** retained temporarily with a named replacement.

## Visual domains

1. **Product UI:** navigation, forms, practice, coaching, account, and calibration share semantic
   foundations and UI primitives.
2. **Measurement visualization:** charts share typography and surfaces but use the chart theme for
   data colors. A data series is not a primary action.
3. **Audio and recorded artifacts:** playback and recording controls share product foundations but
   own media-specific state and accessibility behavior.
4. **Generated coaching content:** prose uses product typography; its wording is authored data and
   must not be encoded as a visual token.

## Change workflow

1. Describe the user need and whether the change is additive, breaking, or an exception.
2. Search `components/ui`, `components/practice`, Storybook, and `patterns.md` before adding a new
   primitive.
3. Define semantics, states, content limits, accessibility, responsive behavior, and prop names.
4. Identify the theme, component, story, test, and documentation artifacts that must move together.
5. Review the composed screen separately from the reusable contract.
6. Mark replacements as deprecated before removing consumers.

Use [foundations.md](foundations.md), [components.md](components.md),
[patterns.md](patterns.md), and [audit.md](audit.md) for the supported contracts.
