-- A message, its practice, and its attempt must all belong to the same singer.
-- Composite keys enforce that invariant even for direct authenticated writes;
-- nullable legacy attempt ids continue to pass under PostgreSQL MATCH SIMPLE.

create unique index if not exists sessions_attempt_practice_owner
  on public.sessions (id, practice_session_id, user_id);

create unique index if not exists practice_sessions_id_owner
  on public.practice_sessions (id, user_id);

alter table public.practice_messages
  drop constraint if exists practice_messages_attempt_id_fkey;

alter table public.practice_messages
  add constraint practice_messages_attempt_context_fkey
  foreign key (attempt_id, practice_session_id, user_id)
  references public.sessions (id, practice_session_id, user_id)
  on delete cascade;

alter table public.practice_messages
  add constraint practice_messages_practice_owner_fkey
  foreign key (practice_session_id, user_id)
  references public.practice_sessions (id, user_id)
  on delete cascade;
