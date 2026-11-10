# Exercise-generation fixtures

`exercise_parity.json` originally captured the Python exercise generator, retired
in commit `c59d104`. It now also records the intentional range-safety correction
for issue #10.

The 138 cases whose targets already fit their calibration remain unchanged. The
30 unsafe narrow-range cases now use the existing sustained-note exercise, with
its original duration and vowel, within the calibrated range. Focus suffixes are
preserved, but incompatible curated drill names and linkage are not retained.
No intervals are compressed or new exercise patterns invented.

The TypeScript range tests cover all four types over spans from 0 to 24 semitones,
including direct curated-drill requests, a real catalogue octave drill, repeated
skips, and a zero-width range. Curated catalogue activities keep their existing
exact event intervals and range rejection. Generated range fallbacks persist an
optional `range_fallback` flag so current workspace guidance and retries describe
the sustained note rather than repeat a prior incompatible drill cue. Historical
coaching, cautions, and learning contracts are not rewritten.
