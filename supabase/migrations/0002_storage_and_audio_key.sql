-- Hosted rewrite: recordings move to Storage, sessions point at them.
--
-- The bucket is private; a user may only touch objects under their own
-- <uid>/ prefix. audio_key is nullable because every row predating the
-- rewrite has no stored audio.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

drop policy if exists recordings_owner_select on storage.objects;
drop policy if exists recordings_owner_insert on storage.objects;
drop policy if exists recordings_owner_update on storage.objects;
drop policy if exists recordings_owner_delete on storage.objects;

create policy recordings_owner_select on storage.objects
  for select using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy recordings_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy recordings_owner_update on storage.objects
  for update using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy recordings_owner_delete on storage.objects
  for delete using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table public.sessions add column if not exists audio_key text;
