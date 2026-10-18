begin;
select plan(7);

insert into auth.users (id)
values
  ('22222222-2222-2222-2222-222222222201'),
  ('22222222-2222-2222-2222-222222222202');

insert into public.calibration (id, user_id, ts, range_low_midi, range_high_midi)
values
  ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222201', now(), 48, 72),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222202', now(), 48, 72);

insert into public.practice_sessions (id, user_id, starting_direction)
values
  ('22222222-2222-2222-2222-222222222211', '22222222-2222-2222-2222-222222222201', 'coach_pick'),
  ('22222222-2222-2222-2222-222222222212', '22222222-2222-2222-2222-222222222202', 'coach_pick');

select ok(
  not has_function_privilege('anon', 'public.delete_own_account()', 'execute'),
  'signed-out visitors cannot call delete_own_account'
);
select ok(
  has_function_privilege('authenticated', 'public.delete_own_account()', 'execute'),
  'signed-in singers can call delete_own_account'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222201","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.delete_own_account() $$,
  'a signed-in singer can delete their own account'
);

reset role;

select results_eq(
  $$ select count(*)::integer from auth.users where id = '22222222-2222-2222-2222-222222222201' $$,
  array[0],
  'the caller is removed from auth.users'
);
select results_eq(
  $$
    select count(*)::integer from public.calibration
    where user_id = '22222222-2222-2222-2222-222222222201'
  $$,
  array[0],
  'the caller''s data cascades away'
);
select results_eq(
  $$
    select
      (select count(*) from auth.users where id = '22222222-2222-2222-2222-222222222202')::integer
      + (select count(*) from public.practice_sessions
         where user_id = '22222222-2222-2222-2222-222222222202')::integer
  $$,
  array[2],
  'other singers and their data are untouched'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.delete_own_account() $$,
  '28000',
  null,
  'a request without a user id is refused'
);
reset role;

select * from finish();
rollback;
