## What changed

Describe the user need and whether this is additive, breaking, or an intentional exception.

## Design-system impact

- [ ] I searched `components/ui`, `components/practice`, Storybook, and `docs/design` for reuse.
- [ ] New interface values use semantic theme roles or a documented data/rendering exception.
- [ ] Loading, empty, disabled, partial, error, and destructive states are covered where relevant.
- [ ] Keyboard, focus, long-content, and narrow-layout behavior were reviewed.
- [ ] Shared contract changes include matching stories, tests, and documentation.
- [ ] Deprecated components or patterns include a replacement and removal path.

## Validation

List the relevant tests, build, Storybook, and manual workflow checks.

## Database impact

- [ ] This change does not require a database change, or it includes a new timestamped forward migration created with `supabase migration new`.
- [ ] Existing migration files were not edited, renamed, or deleted.
- [ ] The full migration chain and schema contract pass from a clean local database.
- [ ] The migration is backward-compatible with the currently deployed application.
