-- Preserve why a proposal was selected and which reference path the singer heard.
alter table public.sessions
  add column proposal_metadata_json text,
  add constraint sessions_proposal_metadata_json_valid
    check (
      proposal_metadata_json is null
      or proposal_metadata_json::jsonb is not null
    ) not valid;
