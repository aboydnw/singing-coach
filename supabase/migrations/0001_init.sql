-- singing-coach: calibration and session history, scoped per account.
--
-- Audio is never uploaded. These tables hold measurements, the exercise spec and
-- the coaching text only. audio_path is deliberately absent: it is a local
-- filesystem path with no meaning on another device.

create table if not exists public.calibration (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null,
  range_low_midi integer not null,
  range_high_midi integer not null,
  tessitura_low_midi integer,
  tessitura_high_midi integer,
  created_at timestamptz not null default now(),
  constraint calibration_range_ordered check (range_low_midi <= range_high_midi),
  constraint calibration_tessitura_paired check (
    (tessitura_low_midi is null) = (tessitura_high_midi is null)
  ),
  constraint calibration_tessitura_within_range check (
    tessitura_low_midi is null or (
      tessitura_low_midi <= tessitura_high_midi
      and tessitura_low_midi >= range_low_midi
      and tessitura_high_midi <= range_high_midi
    )
  )
);

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null,
  exercise_type text not null,
  exercise_spec_json text,
  measurements_json text not null,
  coaching_md text not null default '',
  coaching_json text,
  created_at timestamptz not null default now()
);

create index if not exists calibration_user_ts on public.calibration (user_id, ts desc);
create index if not exists sessions_user_ts on public.sessions (user_id, ts desc);

-- Row level security: every account sees only its own rows. The client uses the
-- anon key, so these policies are the only thing standing between users.
alter table public.calibration enable row level security;
alter table public.sessions enable row level security;

drop policy if exists calibration_owner_select on public.calibration;
drop policy if exists calibration_owner_insert on public.calibration;
drop policy if exists calibration_owner_update on public.calibration;
drop policy if exists calibration_owner_delete on public.calibration;

create policy calibration_owner_select on public.calibration
  for select using ((select auth.uid()) = user_id);
create policy calibration_owner_insert on public.calibration
  for insert with check ((select auth.uid()) = user_id);
create policy calibration_owner_update on public.calibration
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy calibration_owner_delete on public.calibration
  for delete using ((select auth.uid()) = user_id);

drop policy if exists sessions_owner_select on public.sessions;
drop policy if exists sessions_owner_insert on public.sessions;
drop policy if exists sessions_owner_update on public.sessions;
drop policy if exists sessions_owner_delete on public.sessions;

create policy sessions_owner_select on public.sessions
  for select using ((select auth.uid()) = user_id);
create policy sessions_owner_insert on public.sessions
  for insert with check ((select auth.uid()) = user_id);
create policy sessions_owner_update on public.sessions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy sessions_owner_delete on public.sessions
  for delete using ((select auth.uid()) = user_id);
