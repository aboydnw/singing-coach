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

## Durable practice-attempt rollout

The application requires `20261026120000_durable_attempt_jobs.sql` before durable attempt requests
are enabled. The migration adds the job ledger, owner-only read policy, one-active-job constraint,
and the service-role-only idempotent attempt persistence function.

Configure the same random `ATTEMPT_JOB_SIGNING_SECRET` (at least 32 bytes) for the Next.js and
Python runtimes in every Vercel environment. It signs short-lived, job-scoped assertions; never
expose it through a `NEXT_PUBLIC_` variable. Vercel Workflow also needs its generated handlers to
remain reachable at `/.well-known/workflow/v1/flow` and
`/.well-known/workflow/v1/webhook/[token]`.

Deploy in this order:

1. Apply and verify the migration.
2. Add `ATTEMPT_JOB_SIGNING_SECRET` to the Vercel environment and redeploy all functions.
3. Deploy the application and confirm the two Workflow routes are present in the build output.
4. Record a short attempt in a preview, wait for “Recording uploaded,” background the app, then
   return and confirm the same attempt advances through analysis and coaching without duplication.
5. Force one processing failure, use Retry processing, and confirm the original job remains the
   root of a single saved attempt.

### Rollback

Roll back the application deployment first. Keep the additive job table and function in place so
in-flight work and old application versions remain safe; do not delete queued jobs. A later cleanup
migration may remove the durable schema only after no deployed version uses it and all active jobs
are terminal. Rotating the signing secret invalidates outstanding assertions, so do that only after
allowing active jobs to finish or accepting that they will need an explicit retry.
