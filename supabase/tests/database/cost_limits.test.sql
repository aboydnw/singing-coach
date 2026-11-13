begin;
select plan(26);
select has_table('public', 'cost_limit_policy', 'cost_limit_policy exists');
select has_table('public', 'cost_entitlements', 'cost_entitlements exists');
select has_table('public', 'cost_usage_buckets', 'cost_usage_buckets exists');
select ok(not has_function_privilege('anon', 'public.consume_cost_operation(uuid,text)', 'EXECUTE'), 'anonymous cannot call quota RPC');
select ok(not has_function_privilege('authenticated', 'public.consume_cost_operation(uuid,text)', 'EXECUTE'), 'signed-in clients cannot consume/reset quotas or impersonate owners');
select ok(has_function_privilege('service_role', 'public.consume_cost_operation(uuid,text)', 'EXECUTE'), 'server can consume quota');
select ok(not has_table_privilege('authenticated', 'public.cost_entitlements', 'INSERT,UPDATE,DELETE'), 'clients cannot assign paid/admin');
select ok(not has_table_privilege('authenticated', 'public.cost_usage_buckets', 'SELECT,INSERT,UPDATE,DELETE'), 'clients cannot inspect/reset counters');
select ok(not has_table_privilege('authenticated', 'public.cost_limit_policy', 'INSERT,UPDATE,DELETE'), 'clients cannot change global policy');
select is((select count(*)::integer from pg_class where relname in ('cost_limit_policy','cost_entitlements','cost_usage_buckets') and relrowsecurity), 3, 'RLS is enabled on all new tables');

insert into auth.users (id) values ('f1000000-0000-4000-8000-000000000001'), ('f1000000-0000-4000-8000-000000000002'), ('f1000000-0000-4000-8000-000000000003');
-- This suite also runs against the linked DB after migrations. Isolate fixture
-- budgets from existing usage/operator policy, and restore both on ROLLBACK.
-- Hold the policy lock before clearing counters, so live admission waits for
-- this short test transaction rather than observing the synthetic allowance.
update public.cost_limit_policy set enabled = true, free_monthly = 1, paid_monthly = 2,
  user_per_minute = 5, global_per_minute = 30, global_per_day = 100, global_per_month = 1000;
delete from public.cost_usage_buckets;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000001', 'coach')->>'allowed', 'true', 'free account gets its first allowance');
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000001', 'analyze')->>'allowed', 'false', 'different endpoints share one monthly allowance');
select is((select operations from public.cost_usage_buckets where scope='global:month'), 1, 'denial does not consume global allowance');

insert into public.cost_entitlements values ('f1000000-0000-4000-8000-000000000002', 'paid', now()+interval '1 day');
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000002', 'coach')->>'allowed', 'true', 'active paid account starts');
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000002', 'coach')->>'allowed', 'true', 'retry consumes another operation within paid allowance');
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000002', 'chat')->>'allowed', 'false', 'paid allowance is enforced');
update public.cost_entitlements set paid_until=now()-interval '1 second' where user_id='f1000000-0000-4000-8000-000000000002';
update public.cost_usage_buckets set operations=1 where scope='f1000000-0000-4000-8000-000000000002:month';
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000002', 'chat')->>'allowed', 'false', 'expired paid account falls back to free without resetting usage');

insert into public.cost_entitlements values ('f1000000-0000-4000-8000-000000000003', 'admin', null);
update public.cost_limit_policy set user_per_minute=1;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000003', 'resynth')->>'allowed', 'true', 'admin starts');
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000003', 'resynth')->>'allowed', 'true', 'admin bypasses personal monthly/minute quotas');
update public.cost_limit_policy set global_per_month=5;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000003', 'coach')->>'reason', 'global_limit', 'admin still obeys emergency global budget');
update public.cost_limit_policy set global_per_month=1000, enabled=false;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000003', 'coach')->>'reason', 'unavailable', 'kill switch blocks admin');
update public.cost_limit_policy set enabled=true, free_monthly=20;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000001', 'chat')->>'reason', 'account_limit', 'minute limit is shared across operation types');
select ok((public.consume_cost_operation('f1000000-0000-4000-8000-000000000001', 'chat')->>'retry_after')::integer > 0, 'denial supplies positive retry time');
select throws_ok($$select public.consume_cost_operation('f1000000-0000-4000-8000-000000000001', 'unmetered')$$, '22023', 'unknown cost operation', 'unrecognized operations cannot skip accounting');
select is(public.consume_cost_operation(null, 'coach')->>'reason', 'unavailable', 'missing identity fails closed');
set local role service_role;
select is(public.consume_cost_operation('f1000000-0000-4000-8000-000000000003', 'coach')->>'allowed', 'true', 'RPC succeeds under actual service_role privileges');
reset role;
select * from finish();
rollback;
