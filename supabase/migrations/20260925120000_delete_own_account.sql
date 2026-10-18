-- Self-service account deletion.
--
-- The client removes the singer's recordings from Storage first (Storage
-- objects cannot be deleted with SQL), then calls this function. Deleting the
-- auth.users row cascades to calibration, sessions, practice_sessions, and
-- practice_messages through their user_id foreign keys.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
