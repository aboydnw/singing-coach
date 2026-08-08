-- Practice is the durable parent of individual recorded attempts. A singer can
-- leave and resume one active practice, while ended practices are immutable in
-- the application and remain available for Progress and review.

create table if not exists public.practice_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'ended')),
  starting_direction text not null
    check (starting_direction in ('coach_pick', 'pitch', 'steadiness', 'tone', 'free_sing')),
  learning_contract_json jsonb,
  summary_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_session_end_consistent check (
    (status = 'in_progress' and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create unique index if not exists one_active_practice_session_per_user
  on public.practice_sessions (user_id)
  where status = 'in_progress';
create index if not exists practice_sessions_user_started
  on public.practice_sessions (user_id, started_at desc);

alter table public.sessions
  add column if not exists practice_session_id uuid
    references public.practice_sessions (id) on delete cascade;
alter table public.sessions
  add column if not exists sequence_number integer;
alter table public.sessions
  add column if not exists parent_attempt_id uuid
    references public.sessions (id) on delete set null;
alter table public.sessions
  add column if not exists attempt_kind text
    check (attempt_kind is null or attempt_kind in ('initial', 'retry'));

create index if not exists sessions_practice_sequence
  on public.sessions (practice_session_id, sequence_number);

create table if not exists public.practice_messages (
  id uuid primary key,
  practice_session_id uuid not null
    references public.practice_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content_json jsonb not null,
  context_anchor_json jsonb,
  status text not null default 'complete'
    check (status in ('pending', 'streaming', 'complete', 'failed', 'stopped')),
  client_request_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists practice_messages_idempotency
  on public.practice_messages (user_id, client_request_id)
  where client_request_id is not null;
create index if not exists practice_messages_session_created
  on public.practice_messages (practice_session_id, created_at);

alter table public.practice_sessions enable row level security;
alter table public.practice_messages enable row level security;

create policy practice_sessions_owner_select on public.practice_sessions
  for select using ((select auth.uid()) = user_id);
create policy practice_sessions_owner_insert on public.practice_sessions
  for insert with check ((select auth.uid()) = user_id);
create policy practice_sessions_owner_update on public.practice_sessions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy practice_sessions_owner_delete on public.practice_sessions
  for delete using ((select auth.uid()) = user_id);

create policy practice_messages_owner_select on public.practice_messages
  for select using ((select auth.uid()) = user_id);
create policy practice_messages_owner_insert on public.practice_messages
  for insert with check ((select auth.uid()) = user_id);
create policy practice_messages_owner_update on public.practice_messages
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy practice_messages_owner_delete on public.practice_messages
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.practice_sessions to authenticated;
grant select, insert, update, delete on table public.practice_messages to authenticated;
