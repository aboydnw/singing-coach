# singing-coach

A personal AI voice coach. Record a vocal exercise or passage, get measurement-backed feedback, and track your progress over time. Runs on Vercel with Supabase for auth, history and recordings — no server to manage.

Inspired by [Vocal Range Explorer](https://github.com/dannybauman/Vocal-Range-Explorer), which detects vocal type but stops short of coaching.

![screenshot placeholder](docs/screenshot.png)

## How to use

1. **Sign in.** Email and password. History and recordings are private to your account.

2. **Calibrate** (~5 min, once). The Calibrate tab asks for four reference notes:
   - Lowest comfortable note
   - Highest comfortable note
   - Lowest "edge" (chest break / vocal floor)
   - Highest "edge" (head break / vocal ceiling)

   Hold each note for ~3 seconds and the app detects its pitch. Save when all four are detected.

3. **Exercise.** The Exercise tab shows a generated exercise scaled to your range — a sustained tone, a 5-note scale, an arpeggio, or a siren. Hear the reference tones, sing the exercise, and get:
   - A pitch chart overlaying your contour against the target notes
   - A scorecard in plain language: cents off each note, breath steadiness, tone clarity, and vibrato, each flagged 🟢/🟡/🔴 against a healthy range
   - Coaching feedback from the model

   After the first session, the next exercise is chosen to train whatever the coach told you to work on — flat pitch gets you a scale, shaky breath gets you a sustained tone.

4. **Free-sing.** Same analysis without target notes — sing whatever you want, get feedback on breath, vibrato, and tone quality.

5. **Progress.** Trends across sessions with the healthy zone shaded on each panel: pitch accuracy, jitter, shimmer, HNR, vibrato rate and depth. Play back any stored recording.

## How it works

```
browser: record -> encode WAV -> upload to Supabase Storage
   -> POST /api/analyze   (Python: torchcrepe + Praat, unchanged DSP)
   -> POST /api/coach     (TypeScript: OpenRouter, structured output)
   -> insert session      (Supabase, row-level security)
```

Pitch detection uses [torchcrepe](https://github.com/maxrmorrison/torchcrepe), a neural pitch tracker. The voiced part of your recording is split across the exercise's target notes to score each one in cents. Voice-quality measurements (jitter, shimmer, HNR, formants) come from [Praat](https://www.fon.hum.uva.nl/praat/) via [Parselmouth](https://parselmouth.readthedocs.io/). Vibrato rate and extent are extracted from an FFT of the pitch contour. That pipeline runs in `src/singing_coach/`, imported unchanged by the `/api/analyze` Vercel Python function — the numbers are the product, so the DSP chain is pinned by a committed regression fixture (`tests/test_regression_fixture.py`) and torchcrepe's pitch dither is seeded so identical audio always measures identically.

Coaching is a single model call. The model gets the measurements, the exercise spec, your last five sessions — including the advice it gave you after each one — and a catalogue of diagnostic states and drills. The prompt and output schema live in [`prompts/coaching.json`](prompts/coaching.json), shared by the TypeScript route, the Python tests, and the eval harness.

**The model selects; it does not invent.** Vocal technique lives in [`prompts/pedagogy.json`](prompts/pedagogy.json) — diagnostic states, each with a metric signature, a named remediation family from the literature (SOVT, glottal onset work, Vocal Function Exercises, resonant voice, messa di voce), drills, cues and cautions. The model returns a `state_id` and a `drill_id` from that closed set, and [`app/api/coach/route.ts`](app/api/coach/route.ts) resolves the canonical instructions server-side. An id that is not in the asset never reaches you: it falls back to a deterministic signature match in [`lib/pedagogy.ts`](lib/pedagogy.ts). A hallucinated drill is advice about someone's throat, which is why the model is allowed to choose and to phrase, but never to make up technique.

The asset is content, not code — a voice teacher can edit it without touching TypeScript, with the eval harness as the acceptance gate. Its one editorial rule: every cue uses an **external** focus of attention ("aim the sound at the far wall") rather than an internal one ("lift your soft palate"), which motor-learning research finds produces better retention and transfer.

Below three sessions the coach sits in a **calibrating** state: it reports what it measured but will not name a chronic problem. Acoustic thresholds vary with pitch, loudness, vowel, microphone and analysis software, and one singer's healthy baseline can look like another's problem — so scoring a stranger against universal bands is how a first session invents a problem out of noise.

Two things replace prose where a sound or a picture teaches better. **Ghost racing** overlays your own best previous take of the same drill on the pitch chart, so the comparison is against yourself rather than a universal band. **Hear it right** rebuilds your take with one flaw corrected — steadier pitch, or an even 5.5 Hz vibrato — using Praat's PSOLA via [`src/singing_coach/resynth.py`](src/singing_coach/resynth.py), so you hear the target in your own voice instead of reading about it. PSOLA reshapes pitch and timing while leaving timbre alone, which is what keeps it sounding like you. Breathiness is deliberately not corrected: that needs spectral subtraction on the aperiodic component, a much larger project than a pitch-tier swap.

The UI is Next.js with Chakra UI. Exercise generation and reference tones run in the browser (`lib/exercises.ts`, `lib/toneGen.ts`); a 168-case parity fixture pins the exercise port to the Python original. Recordings are encoded to WAV in the browser at the microphone's native sample rate — the server's librosa remains the only resampler in the chain, exactly as before the rewrite.

## Development

You'll need [uv](https://docs.astral.sh/uv/), Node 22+, and yarn.

```bash
git clone https://github.com/aboydnw/singing-coach.git
cd singing-coach
uv sync                  # Python: analysis pipeline + tests
yarn install             # TypeScript: app + tests

uv run pytest            # analysis regression + parity + prompt-sync tests
yarn test                # exercises/wav/schema tests
yarn dev                 # Next.js dev server (needs .env.local, see .env.example)
yarn storybook           # local component and pattern catalogue
yarn design:check        # reject unexplained product-interface color literals
```

Design foundations, reusable component contracts, workflow patterns and lifecycle labels live in
[`docs/design/`](docs/design/README.md). Runtime behavior remains authoritative in the component;
Storybook provides stable executable examples without depending on Supabase or OpenRouter.

`yarn dev` serves the UI and the coach route. The Python `/api/analyze` function only runs on Vercel; point local testing at a preview deployment or use `vercel dev`.

To run the coaching eval (plants known vocal problems, checks the model diagnoses them). It asserts both the focus area and the `state_id`, which is the stronger check — a closed-set classification into `pedagogy.json` is unambiguous in a way a judgement about prose is not. It also counts how often the model named an id outside the asset, which is a prompt bug even when the focus area happened to be right:

```bash
yarn dev &
uv run python evals/coach_eval.py
```

## Session recording for product testing

Dev servers and Vercel **preview** deployments carry a floating record button
([riffrec](https://github.com/kieranklaassen/riffrec)). It captures the screen, optional voice
narration, clicks, navigation, network outcomes and console errors, then downloads a
`riffrec-*.zip`. Drop those in a gitignored `.feedback/` directory for an agent to read.

Production never gets it. `next.config.ts` resolves `riffrec` to an empty module on production
builds, so it is absent from the client bundle rather than merely inert — the runtime guard in
[`components/DevFeedback.tsx`](components/DevFeedback.tsx) alone would not achieve that, because
webpack registers a dynamic import as a dependency while parsing and emits its chunk regardless.
To check after a change:

```bash
NEXT_PUBLIC_VERCEL_ENV=production yarn build && grep -rl riffrec .next/static/   # expect no match
NEXT_PUBLIC_VERCEL_ENV=preview    yarn build && grep -rl riffrec .next/static/   # expect a match
```

Two things that will silently cost you the button:

- **Preview detection needs `NEXT_PUBLIC_VERCEL_ENV`,** which arrives only while the Vercel project
  has _Automatically expose System Environment Variables_ enabled (the default). Without it, a
  preview build is indistinguishable from production and the recorder is stripped.
- **Screen capture needs a secure context.** Preview URLs are HTTPS, so they just work. Locally on
  a headless VM, `http://<vm-ip>:3000` is _not_ a secure context and the browser blocks capture with
  no error. Tunnel instead of using `--host`, which makes it `localhost` on your laptop:

  ```bash
  ssh -N -L 3000:localhost:3000 user@dev-server
  ```

## Deployment

The app deploys to Vercel from this repo. Requirements beyond the defaults:

- **Large functions.** The analyze function bundles CPU-only PyTorch (~1.2 GB uncompressed), far over the standard 500 MB Python cap. Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` as a project env var; Fluid compute with Active CPU must be enabled.
- **Environment variables:** see [`.env.example`](.env.example) — Supabase URL/keys for the browser and the analyze function, `OPENROUTER_API_KEY` and `COACH_MODEL` for coaching.
- **Supabase:** run every file in [`supabase/migrations/`](supabase/migrations/) against your project, in order. They create the tables, the private `recordings` bucket, the row-level-security policies that keep accounts apart, and the `contour_json` column that ghost racing reads. Ghost racing stays silently empty until `0003` is applied.

`uv.lock` is the single dependency manifest, locally and on Vercel. It pins torch/torchaudio to the CPU index (`[tool.uv.sources]` in `pyproject.toml`): the default PyPI wheels bundle ~4 GB of CUDA libraries that nothing here uses — and that blew even the 5 GB function limit before the pin.

## Costs

Coaching goes through [OpenRouter](https://openrouter.ai/) against an open-weight model chosen by env var. At `openai/gpt-oss-120b` pricing, a session costs a fraction of a cent — daily practice for a year rounds to under a dollar. Vercel Hobby and Supabase Free cover the rest at personal scale.

Run the eval before trusting a new model: `uv run python evals/coach_eval.py` checks that it diagnoses planted problems (breathy tone, flat pitch, shaky breath, missing vibrato) instead of guessing.

## Privacy

Recordings upload to a **private Supabase Storage bucket** scoped to your account and are kept for playback — this is what makes "listen back on any device" work. Storage policies allow each account to touch only its own files; the analyze and resynth functions both verify your signed-in identity and refuse any storage key outside your own prefix before reading a recording. Corrected clips from "hear it right" are written back into that same private prefix. Structured measurements, the exercise spec, and recent history — never audio — go to the coaching model via OpenRouter.

This replaces the old local-only design, where audio never left the machine that recorded it. If audio-stays-local matters to you, the last Gradio version lives in git history.

## Supported platforms

Modern Chrome, Safari, Firefox — anything with MediaRecorder and Web Audio. The analyze function runs on Vercel's Python runtime (Linux x86-64), which matches the platforms torchcrepe and Praat are compiled for.

## License

MIT
