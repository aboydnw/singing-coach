-- Forward-only hardening for schema that has already shipped to production.
-- Keep earlier migrations immutable so their checksums and remote history remain stable.

alter table public.calibration
  add constraint calibration_range_midi_bounds
  check (
    range_low_midi between 0 and 127
    and range_high_midi between 0 and 127
  );

alter table public.sessions
  add constraint sessions_exercise_spec_json_valid
    check (exercise_spec_json is null or exercise_spec_json::jsonb is not null),
  add constraint sessions_measurements_json_valid
    check (measurements_json::jsonb is not null),
  add constraint sessions_coaching_json_valid
    check (coaching_json is null or coaching_json::jsonb is not null);

update storage.buckets
set public = false
where id = 'recordings';
