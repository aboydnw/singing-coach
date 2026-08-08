begin;
select plan(17);

select has_table('public', 'practice_sessions', 'practice_sessions exists');
select has_table('public', 'practice_messages', 'practice_messages exists');
select has_column('public', 'sessions', 'practice_session_id', 'sessions link to a practice session');
select has_column('public', 'sessions', 'sequence_number', 'sessions have a practice sequence');
select has_column('public', 'sessions', 'parent_attempt_id', 'sessions can link retries');
select has_column('public', 'sessions', 'attempt_kind', 'sessions identify attempt kind');

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
