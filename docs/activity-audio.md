# Activity reference audio

Reference vocals are optional, pre-rendered assets. When a vocal is absent or cannot
be played, the practice screen labels and plays the existing pitch guide instead.

## Approved production direction

Use a DiffSinger-compatible renderer and keep rendering outside the runtime app.
Noncommercial voices and vocoders are acceptable for this project, but every asset
must record the exact engine, voice, and output license used. Do not assume the
engine's license also covers its voicebank, training data, vocoder, or generated
output.

Store reviewed files under `public/audio/activities/`. Use lossless WAV while
reviewing; a later delivery optimization may add compressed copies without changing
the score. Name the seven standard versions with the activity ID and transposition:
`<activity-id>--m6.wav`, `--m4.wav`, `--m2.wav`, `--p0.wav`, `--p2.wav`, `--p4.wav`,
and `--p6.wav`.

Each `reference_audio` entry must include:

- `semitones`: one of -6, -4, -2, 0, 2, 4, or 6
- `src`: a root-relative file beneath `/audio/activities/`
- `engine`: renderer and version
- `voice`: voicebank name and version
- `license`: the applicable output/redistribution license
- `reviewed`: `true` only after the listening review below

## Listening review

Before marking a file reviewed, confirm that it has the same pitches, timing, rests,
and syllables as the resolved score; that the lyric is intelligible; that the voice
does not contain glitches or teach an unhealthy target; and that its key label is
correct. Record attribution required by the voice or model alongside the eventual
asset set.

Run `yarn activities:check` before committing. It rejects missing, empty, unreviewed,
or undocumented files. Never add silence or a computer-tone placeholder as a vocal
asset—the built-in pitch-guide fallback already handles incomplete rendering safely.
