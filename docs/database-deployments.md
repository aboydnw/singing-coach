# Database deployment runbook

Supabase migrations are production code. Application code must not assume a schema change exists until the production database deployment has passed.

## Required repository settings

Create a protected GitHub environment named `production` with these secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

Make `Verify / application`, `Verify / database`, and `Deploy database / migrate` required checks where GitHub supports the corresponding branch or environment rule. A skipped Supabase preview is not evidence that migrations work.

The current Vercel Git integration can deploy concurrently with the database workflow. Keep migrations backward-compatible so the old and new application versions both work during that window. For strict database-before-frontend ordering, disable Vercel's automatic production deployment and promote the tested Vercel deployment only after `Deploy database / migrate` succeeds.

## Making a schema change

1. Run `supabase migration new <description>`.
2. Put the change in the newly generated file. Never rewrite a migration that has reached `main`.
3. Run `supabase start`, `supabase db reset --local --no-seed`, `supabase db lint --local --fail-on error`, and `supabase test db supabase/tests/database --local`.
4. Update the schema contract when the application gains a new required table, column, grant, policy, or storage setting.
5. Merge only when both Verify jobs pass.

Merges to `main` serialize production database changes, preview the pending migration set, apply it, and then run the schema contract against the linked project.

## Compatibility rule

Use expand/deploy/contract changes:

1. Add nullable columns, new tables, or compatible policies.
2. Deploy application code that can use the expanded schema.
3. Backfill separately when required.
4. Remove old schema only in a later deployment after no running application uses it.

Do not make production schema changes directly in the Supabase Dashboard. If an emergency requires it, capture the change immediately with `supabase db pull`, verify with `supabase db reset`, and commit the generated migration before further deployments.
