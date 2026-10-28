-- Failed processing can be dismissed without deleting its analyzed attempt or
-- losing the failure record needed for support and observability.

alter table public.practice_attempt_jobs
  drop constraint practice_attempt_jobs_status_valid;

alter table public.practice_attempt_jobs
  add constraint practice_attempt_jobs_status_valid
  check (status in ('queued', 'analyzing', 'coaching', 'completed', 'failed', 'abandoned'));
