# singing-coach

A personal AI voice coach. Record a vocal exercise or passage, get measurement-backed feedback, and track your progress over time. Runs on Vercel with Supabase for auth, history and recordings — no server to manage.

Inspired by [Vocal Range Explorer](https://github.com/dannybauman/Vocal-Range-Explorer), which detects vocal type but stops short of coaching.

![screenshot placeholder](docs/screenshot.png)

## How to use

1. **Sign in.** Email and password, or a magic link. History and recordings are private to your account.

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

Coaching is a single model call. The model gets the measurements, the exercise spec, and your last five sessions — including the advice it gave you after each one — so it can follow up on its own coaching rather than starting cold. The prompt and output schema live in [`prompts/coaching.json`](prompts/coaching.json), shared by the TypeScript route, the Python tests, and the eval harness. Feedback comes back as strict structured output (focus area, top issue, why, drill, encouragement), which is what makes adaptive exercise selection possible.

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
```

`yarn dev` serves the UI and the coach route. The Python `/api/analyze` function only runs on Vercel; point local testing at a preview deployment or use `vercel dev`.

To run the coaching eval (plants known vocal problems, checks the model diagnoses them):

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
  has *Automatically expose System Environment Variables* enabled (the default). Without it, a
  preview build is indistinguishable from production and the recorder is stripped.
- **Screen capture needs a secure context.** Preview URLs are HTTPS, so they just work. Locally on
  a headless VM, `http://<vm-ip>:3000` is *not* a secure context and the browser blocks capture with
  no error. Tunnel instead of using `--host`, which makes it `localhost` on your laptop:

  ```bash
  ssh -N -L 3000:localhost:3000 user@dev-server
  ```

## Deployment

The app deploys to Vercel from this repo. Requirements beyond the defaults:

- **Large functions.** The analyze function bundles CPU-only PyTorch (~1.2 GB uncompressed), far over the standard 500 MB Python cap. Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` as a project env var; Fluid compute with Active CPU must be enabled.
- **Environment variables:** see [`.env.example`](.env.example) — Supabase URL/keys for the browser and the analyze function, `OPENROUTER_API_KEY` and `COACH_MODEL` for coaching.
- **Supabase:** run both files in [`supabase/migrations/`](supabase/migrations/) against your project. They create the tables, the private `recordings` bucket, and the row-level-security policies that keep accounts apart.

`uv.lock` is the single dependency manifest, locally and on Vercel. It pins torch/torchaudio to the CPU index (`[tool.uv.sources]` in `pyproject.toml`): the default PyPI wheels bundle ~4 GB of CUDA libraries that nothing here uses — and that blew even the 5 GB function limit before the pin.

## Costs

Coaching goes through [OpenRouter](https://openrouter.ai/) against an open-weight model chosen by env var. At `openai/gpt-oss-120b` pricing, a session costs a fraction of a cent — daily practice for a year rounds to under a dollar. Vercel Hobby and Supabase Free cover the rest at personal scale.

Run the eval before trusting a new model: `uv run python evals/coach_eval.py` checks that it diagnoses planted problems (breathy tone, flat pitch, shaky breath, missing vibrato) instead of guessing.

## Privacy

Recordings upload to a **private Supabase Storage bucket** scoped to your account and are kept for playback — this is what makes "listen back on any device" work. Storage policies allow each account to touch only its own files; the analyze function verifies your signed-in identity before reading a recording. Structured measurements, the exercise spec, and recent history — never audio — go to the coaching model via OpenRouter.

This replaces the old local-only design, where audio never left the machine that recorded it. If audio-stays-local matters to you, the last Gradio version lives in git history.

## Supported platforms

Modern Chrome, Safari, Firefox — anything with MediaRecorder and Web Audio. The analyze function runs on Vercel's Python runtime (Linux x86-64), which matches the platforms torchcrepe and Praat are compiled for.

## License

MIT
