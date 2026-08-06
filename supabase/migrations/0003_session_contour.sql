-- Ghost racing needs a past take's pitch contour, and sessions only stored the
-- summary measurements. The stored contour is decimated client-side to a few
-- hundred points before it lands here: the overlay needs the shape of the note,
-- not every frame, and full-rate contours would put tens of kilobytes of JSON in
-- every row for no visible gain.
--
-- Nullable on purpose. Rows written before this column existed keep working;
-- they simply cannot be used as a ghost.

alter table public.sessions
  add column if not exists contour_json text;
