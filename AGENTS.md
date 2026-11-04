# Working on Singing Coach

## Start here

- Read [docs/product.md](docs/product.md) for the current product, boundaries, and
  source map. Do not turn an old implementation plan or an open PR into shipped behavior.
- Follow [docs/design/README.md](docs/design/README.md) and its authority table for
  interface decisions. Product meaning lives in `docs/design/`; components own
  runtime behavior and accessibility; theme files own visual foundations.
- Read [README.md](README.md) for setup and architecture, but check its older
  navigation examples against the current routes and design patterns.
- For database work, follow [the deployment runbook](docs/database-deployments.md).
  For reference vocals, follow [the audio policy](docs/activity-audio.md).
- If a request needs a product decision not settled by these sources, ask rather
  than silently introducing a new direction. Preserve existing guidance.

## Repository map

- `app/`, `components/`: Next.js routes, Chakra UI, practice workspace and review.
- `lib/`: shared contracts, activity selection, coaching, persistence, and theme.
- `prompts/`: shared coaching schema and curated pedagogy, activities, repertoire.
- `src/singing_coach/`, `api/`: Python measurement and resynthesis pipeline.
- `workflows/`: durable attempt processing; `supabase/`: migrations and contracts.
- `tests/`, colocated `*.test.ts`, stories, and `evals/`: distinct verification layers.

## Preserve these contracts

- Keep practice controls first. Full analysis and attempt-owned conversation belong
  on attempt detail, not above the recorder. Follow [product patterns](docs/design/patterns.md).
- A singer must stay through upload and durable acknowledgement. Only then may the
  UI say leaving is safe. Preserve persisted stages, idempotency, partial results,
  ownership checks, and checkpoint-based retry.
- The model selects curated technique; it does not invent drills. Preserve canonical
  IDs, server-side validation, cautions, external-focus cues, and baseline uncertainty.
- Measurements are the product. Preserve the DSP regression fixture, seeded pitch
  behavior, native-rate browser WAV encoding, and server-side resampling contract.
- Preserve private account-scoped recordings and row-level security. Never send audio
  to the coaching model or expose service credentials or job-signing secrets to clients.
- Search shared UI, practice components, stories, and design docs before adding a
  primitive. Move shared behavior, tests, stories, and documentation together.
- Never rewrite migrations that reached `main`. Add timestamped forward migrations,
  verify the full chain, and keep old and new applications compatible during deployment.
- Never present placeholder tones or unreviewed synthesis as a vocal example.

## Development and verification

Use Node 22+, the pinned Yarn version in [package.json](package.json), and `uv`.
Install with `yarn install --immutable` and `uv sync`; see [README.md](README.md)
and [the environment example](.env.example). `yarn dev` does not run the Python
Vercel function; use the documented preview or `vercel dev` workflow for analysis.

- Run `yarn verify` for the application aggregate: formatting, design values, Vitest,
  production build, and Storybook build.
- Run `uv run pytest` for Python analysis, regression, parity, and prompt-sync checks.
- Run `yarn activities:check` when changing activity/reference-audio content.
- Run `yarn migrations:check` and the runbook's reset, lint, and database tests for
  schema changes. A skipped preview is not proof that migrations work.
- Run `uv run python evals/coach_eval.py` with the documented app/model configuration
  for coaching or model changes. It is a live eval, not part of `yarn verify`.
- Review relevant phone, keyboard, focus, recovery, and ended-practice states for UI
  changes. Use the [PR checklist](.github/pull_request_template.md).
- Report checks actually run and any limits. `yarn verify` does not include Python,
  activity-audio, or database checks; its formatting glob does not check Markdown.
