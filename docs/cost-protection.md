# Cost protection before public sharing

This is a protective first pass, not a pricing launch. The future direction is a small
free allowance and an optional $10/month plan with $10 of usage credit. There is no
checkout, subscription, payment webhook, or dollar credit balance in this change.
An operation allowance is **not** provider spend accounting. Do not sell it as $10
of API usage or claim it can guarantee a $10 invoice.

## Provisional defaults

A service-only `cost_limit_policy` row holds changeable limits:

- Free: 20 operations per UTC calendar month.
- Paid entitlement scaffold: 200 operations per UTC calendar month, reverting to free
  at `paid_until`. This is not a purchasable plan yet.
- Both: 5 operations per UTC minute, shared across all protected endpoints.
- Owner/testing: no personal allowance or rate limit. Assign only the verified Supabase
  user UUID to a service-only `cost_entitlements` row with `tier = 'admin'`.
- Emergency site ceilings: 30 operations/minute, 100/day, and 1,000/month, UTC.
  These apply to **everyone, including the owner**, and stop new signups from multiplying
  the total allowance. Set `enabled = false` to stop all protected dispatch.

These are deliberately conservative test settings, not settled product pricing.
One attempt commonly consumes 3 operations: workflow handoff, audio analysis, and
coaching. Each provider retry consumes another operation. Calibration analysis,
resynthesis, and a chat response each consume one. Failed/uncertain operations stay
charged because the provider may already have done work. Reaching a limit can leave
analysis saved and coaching incomplete; the existing job can be retried later.
The owner exemption does not skip authentication, request-size/output/duration limits,
or global emergency ceilings. This distinction needs to be accepted before rollout.

## Enforcement

`consume_cost_operation` runs under the existing server service role. Clients cannot
call it, edit entitlements/policy/counters, or claim admin through editable metadata.
The function locks the policy row, checks all shared counters, and increments them
in one transaction before dispatch. Multiple server instances and overlapping calls
therefore cannot each spend the last allowance. Denials change no counters. Fixed
minute windows can admit a burst across a minute boundary; these are admission caps,
not a long-running worker semaphore.

Guards cover direct `/api/coach`, streaming `/api/practice/chat`, `/api/analyze`
(including signed internal jobs), `/api/resynth`, and durable job creation/retry.
The coaching service charges every actual provider attempt, including its automatic
retry and Workflow retries. Quota/configuration failures in workflow steps are fatal
to automatic retry and leave a durable failed job for explicit recovery. Chat request
IDs do not start a second generation on a duplicate insert. A client can delete its
own chat row, but it cannot refund or reset the protected usage counter.

Provider requests are limited to 2,048 output tokens for assessments and 1,024 for
chat, with a 96 KiB serialized input cap. JSON requests are bounded before parsing.
Audio work rejects files beyond the existing 25 MiB cap or 120-second duration cap
before expensive pitch/resynthesis. The byte/duration ceilings apply to admin too.
Usage storage outages, malformed RPC replies, or a missing migration fail closed;
there is no process-local fallback or allow-on-error mode.

## What this does not cap

- Vercel invocation/edge/denied-request costs, Workflow overhead already started,
  Supabase reads and storage/egress, authentication traffic, and frontend hosting.
- Direct client Storage uploads and writes permitted by current RLS. A signed-in
  client can bypass the UI and upload many files; a per-file 25 MiB cap is not an
  account or global storage budget. Storage admission quotas are a separate launch
  blocker if signup is unrestricted.
- Requests in flight before limits are changed. Aborting a request does not promise
  that provider billing stops.
- Any old deployment URL or other consumer using the same provider credential.
- Provider prices, reasoning-token accounting, caching, routing, and platform fees.
  Equal call counts are not equal costs.

Before public sharing, verify provider-side prepaid balances/auto-recharge settings,
API-key budgets and their actual enforcement semantics, plus Vercel/Supabase spend
controls, alerts, authentication abuse controls, and old deployment access. Configure
those only with explicit operator approval. Application quotas add a layer; they do
not replace provider caps or a tested emergency shutdown. No such settings were
changed by this PR.

## Rollout and verification

1. Run full application/Python checks and the database runbook's local reset, lint,
   and pgTAP suite. Review the new schema and admission race behavior.
2. Apply the additive migration through the normal reviewed deployment pipeline before
   deploying the Node and Python changes together. Old deployments remain unguarded.
3. With explicit approval, assign the owner's verified UUID to the admin entitlement.
   Do not infer the owner from an email, browser-supplied role, or user metadata.
4. Test free/paid-expired/admin, concurrent last-allowance requests, duplicate chat,
   all direct endpoints and workflow retries in preview. Confirm 429 with Retry-After,
   outage 503, no provider calls on denial, and recoverable failed jobs.
5. Check the global kill switch even for admin, then restore the deliberate policy.
   No live paid entitlement should be issued as evidence of payment until server-side,
   verified, idempotent billing events are implemented.

Retain the current and previous UTC-month counters for investigation and remove older
buckets through an explicitly approved maintenance process. Deleting an account
cascades personal counters/entitlements; aggregate global counters remain, so account
churn cannot reset the site's allowance. No background cleanup job is configured.

For real dollar credits later, reserve a conservative maximum charge before work,
settle against trusted provider usage, handle ambiguous outcomes without double-spend,
and define the separate platform/payment fees. That decision should follow measured
usage rather than arbitrary operation-to-dollar conversion.
