-- Uploaded recordings become durable jobs before analysis starts. Browser
-- clients may read their own jobs, while only trusted server code advances the
-- lifecycle or turns an analyzed job into a session row.

create table public.practice_attempt_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_session_id uuid not null,
  audio_key text not null,
  status text not null default 'queued',
  exercise_spec_json text,
  proposal_metadata_json text,
  parent_attempt_id uuid references public.sessions (id) on delete set null,
  attempt_kind text not null default 'initial',
  attempt_id uuid unique references public.sessions (id) on delete set null,
  measurements_json text,
  contour_json text,
  workflow_run_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint practice_attempt_jobs_status_valid
    check (status in ('queued', 'analyzing', 'coaching', 'completed', 'failed')),
  constraint practice_attempt_jobs_attempt_kind_valid
    check (attempt_kind in ('initial', 'retry')),
  constraint practice_attempt_jobs_practice_owner_fkey
    foreign key (practice_session_id, user_id)
    references public.practice_sessions (id, user_id)
    on delete cascade,
  constraint practice_attempt_jobs_completion_consistent check (
    (status = 'completed' and completed_at is not null and attempt_id is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create unique index practice_attempt_jobs_one_active_per_practice
  on public.practice_attempt_jobs (practice_session_id)
  where status in ('queued', 'analyzing', 'coaching');
create index practice_attempt_jobs_user_created
  on public.practice_attempt_jobs (user_id, created_at desc);
create index practice_attempt_jobs_practice_created
  on public.practice_attempt_jobs (practice_session_id, created_at);

alter table public.practice_attempt_jobs enable row level security;

create policy practice_attempt_jobs_owner_select
  on public.practice_attempt_jobs
  for select
  using ((select auth.uid()) = user_id);

grant select on table public.practice_attempt_jobs to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.practice_attempt_jobs from authenticated;

create or replace function public.create_attempt_from_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.practice_attempt_jobs%rowtype;
  next_sequence integer;
  new_attempt_id uuid;
  exercise_type_value text;
begin
  select * into job
  from public.practice_attempt_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'attempt job not found' using errcode = 'P0002';
  end if;

  if job.attempt_id is not null then
    return job.attempt_id;
  end if;

  if job.measurements_json is null or job.contour_json is null then
    raise exception 'attempt job has no analysis checkpoint' using errcode = '23514';
  end if;

  -- Serializes sequence allocation for this practice without taking a broad
  -- table lock. The practice row already belongs to the job owner by FK.
  perform 1
  from public.practice_sessions
  where id = job.practice_session_id
  for update;

  select coalesce(max(sequence_number), 0) + 1 into next_sequence
  from public.sessions
  where practice_session_id = job.practice_session_id;

  new_attempt_id := job.id;
  exercise_type_value := coalesce(
    nullif((job.exercise_spec_json::jsonb ->> 'type'), ''),
    'free_sing'
  );

  insert into public.sessions (
    id,
    user_id,
    ts,
    exercise_type,
    exercise_spec_json,
    proposal_metadata_json,
    measurements_json,
    coaching_md,
    coaching_json,
    audio_key,
    contour_json,
    practice_session_id,
    sequence_number,
    parent_attempt_id,
    attempt_kind
  ) values (
    new_attempt_id,
    job.user_id,
    now(),
    exercise_type_value,
    job.exercise_spec_json,
    job.proposal_metadata_json,
    job.measurements_json,
    '',
    null,
    job.audio_key,
    job.contour_json,
    job.practice_session_id,
    next_sequence,
    job.parent_attempt_id,
    job.attempt_kind
  )
  on conflict (id) do nothing;

  update public.practice_attempt_jobs
  set attempt_id = new_attempt_id,
      updated_at = now()
  where id = job.id
    and attempt_id is null;

  return new_attempt_id;
end;
$$;

revoke all on function public.create_attempt_from_job(uuid) from public;
revoke all on function public.create_attempt_from_job(uuid) from anon;
revoke all on function public.create_attempt_from_job(uuid) from authenticated;
grant execute on function public.create_attempt_from_job(uuid) to service_role;
