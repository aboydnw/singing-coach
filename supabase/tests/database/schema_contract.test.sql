begin;
select plan(29);

select has_table('public', 'practice_sessions', 'practice_sessions exists');
select has_table('public', 'practice_messages', 'practice_messages exists');
select has_column('public', 'sessions', 'practice_session_id', 'sessions link to a practice session');
select has_column('public', 'sessions', 'sequence_number', 'sessions have a practice sequence');
select has_column('public', 'sessions', 'parent_attempt_id', 'sessions can link retries');
select has_column('public', 'sessions', 'attempt_kind', 'sessions identify attempt kind');
select has_column('public', 'practice_messages', 'attempt_id', 'messages link to an attempt thread');
select col_is_null('public', 'practice_messages', 'attempt_id', 'legacy messages without attempts remain valid');
select has_index(
  'public',
  'practice_messages',
  'practice_messages_practice_attempt_created',
  'attempt conversations have an ordered read index'
);
select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conname = 'practice_messages_attempt_id_fkey'
      and contype = 'f'
  $$,
  array[0],
  'single-column attempt foreign key is replaced by thread ownership'
);

select has_index(
  'public',
  'sessions',
  'sessions_attempt_practice_owner',
  'attempt ownership has a composite reference key'
);
select has_index(
  'public',
  'practice_sessions',
  'practice_sessions_id_owner',
  'practice ownership has a composite reference key'
);
select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conname = 'practice_messages_attempt_context_fkey'
      and contype = 'f'
  $$,
  array[1],
  'message attempts must match their practice and owner'
);
select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conname = 'practice_messages_practice_owner_fkey'
      and contype = 'f'
  $$,
  array[1],
  'messages must match their practice owner'
);

insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.practice_sessions (
  id, user_id, starting_direction, status, ended_at
)
values
  ('11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'pitch', 'in_progress', null),
  ('11111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'tone', 'ended', now()),
  ('22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222222', 'pitch', 'in_progress', null);

insert into public.sessions (
  id, user_id, ts, exercise_type, measurements_json,
  practice_session_id, sequence_number, attempt_kind
)
values (
  '11111111-1111-1111-1111-111111111110',
  '11111111-1111-1111-1111-111111111111',
  now(), 'sustained_note', '{}',
  '11111111-1111-1111-1111-111111111101', 1, 'initial'
);

select lives_ok(
  $$
    insert into public.practice_messages (
      id, practice_session_id, attempt_id, user_id, role, content_json
    ) values (
      '11111111-1111-1111-1111-111111111120',
      '11111111-1111-1111-1111-111111111101',
      '11111111-1111-1111-1111-111111111110',
      '11111111-1111-1111-1111-111111111111',
      'user', '{"text":"matching thread"}'
    )
  $$,
  'a message can reference its own attempt thread'
);

select throws_ok(
  $$
    insert into public.practice_messages (
      id, practice_session_id, attempt_id, user_id, role, content_json
    ) values (
      '11111111-1111-1111-1111-111111111121',
      '11111111-1111-1111-1111-111111111102',
      '11111111-1111-1111-1111-111111111110',
      '11111111-1111-1111-1111-111111111111',
      'user', '{"text":"wrong practice"}'
    )
  $$,
  '23503', null,
  'an attempt cannot be attached to a different practice'
);

select throws_ok(
  $$
    insert into public.practice_messages (
      id, practice_session_id, attempt_id, user_id, role, content_json
    ) values (
      '11111111-1111-1111-1111-111111111122',
      '22222222-2222-2222-2222-222222222201',
      null,
      '11111111-1111-1111-1111-111111111111',
      'user', '{"text":"wrong owner"}'
    )
  $$,
  '23503', null,
  'a message cannot be attached to another owner practice'
);

select lives_ok(
  $$
    insert into public.practice_messages (
      id, practice_session_id, attempt_id, user_id, role, content_json
    ) values (
      '11111111-1111-1111-1111-111111111123',
      '11111111-1111-1111-1111-111111111101',
      null,
      '11111111-1111-1111-1111-111111111111',
      'user', '{"text":"legacy message"}'
    )
  $$,
  'legacy messages may keep a null attempt within their owner practice'
);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.practice_sessions'::regclass $$,
  array[true],
  'practice_sessions has RLS'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.practice_messages'::regclass $$,
  array[true],
  'practice_messages has RLS'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.sessions'::regclass $$,
  array[true],
  'sessions has RLS'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.practice_sessions', 'SELECT'),
  'authenticated can read practice sessions'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.practice_sessions', 'INSERT'),
  'authenticated can create practice sessions'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.practice_messages', 'SELECT'),
  'authenticated can read practice messages'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.practice_messages', 'INSERT'),
  'authenticated can create practice messages'
);

select col_is_null('public', 'sessions', 'practice_session_id', 'legacy attempts need no practice session');
select col_is_null('public', 'sessions', 'parent_attempt_id', 'initial attempts need no parent');

select results_eq(
  $$ select public from storage.buckets where id = 'recordings' $$,
  array[false],
  'recordings bucket is private'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conname in (
      'calibration_range_midi_bounds',
      'sessions_exercise_spec_json_valid',
      'sessions_measurements_json_valid',
      'sessions_coaching_json_valid'
    )
  $$,
  array[4],
  'data-integrity constraints exist'
);

select * from finish();
rollback;
