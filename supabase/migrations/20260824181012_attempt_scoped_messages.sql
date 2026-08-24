-- Practice conversations now belong to a recorded attempt. The column remains
-- nullable only for legacy practices that contain messages but no attempts.
alter table public.practice_messages
  add column if not exists attempt_id uuid;

-- Prefer an explicit immutable context anchor. Otherwise attach a message to
-- the attempt that existed when it was sent, falling back to the first attempt
-- for pre-attempt legacy messages.
update public.practice_messages as message
set attempt_id = coalesce(
  (
    select attempt.id
    from public.sessions as attempt
    where attempt.practice_session_id = message.practice_session_id
      and attempt.id::text = message.context_anchor_json ->> 'sourceId'
    limit 1
  ),
  (
    select attempt.id
    from public.sessions as attempt
    where attempt.practice_session_id = message.practice_session_id
      and attempt.ts <= message.created_at
    order by
      attempt.ts desc,
      attempt.sequence_number desc nulls last,
      attempt.id desc
    limit 1
  ),
  (
    select attempt.id
    from public.sessions as attempt
    where attempt.practice_session_id = message.practice_session_id
    order by
      attempt.ts asc,
      attempt.sequence_number asc nulls last,
      attempt.id asc
    limit 1
  )
)
where message.attempt_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'practice_messages_attempt_id_fkey'
      and conrelid = 'public.practice_messages'::regclass
  ) then
    alter table public.practice_messages
      add constraint practice_messages_attempt_id_fkey
      foreign key (attempt_id)
      references public.sessions (id)
      on delete cascade;
  end if;
end
$$;

create index if not exists practice_messages_practice_attempt_created
  on public.practice_messages (practice_session_id, attempt_id, created_at);
