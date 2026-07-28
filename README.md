# singing-coach

A personal AI voice coach. Record a vocal exercise or passage, get measurement-backed feedback from Claude, and track your progress over time. Runs locally; audio and measurements stay on your machine — only the structured measurements are sent to the Anthropic API for coaching.

Inspired by [Vocal Range Explorer](https://github.com/dannybauman/Vocal-Range-Explorer), which detects vocal type but stops short of coaching.

![screenshot placeholder](docs/screenshot.png)

## Setup

You'll need [uv](https://docs.astral.sh/uv/) and an [Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/aboydnw/singing-coach.git
cd singing-coach
uv sync

# Option A — set the key now
cp .env.example .env   # edit .env, paste your key

# Option B — skip; the app will prompt for it on first run

uv run singing-coach
```

First launch downloads the torchcrepe pitch model (~2 GB). Subsequent launches are fast.

## How to use

1. **Calibrate** (~5 min, once). The Calibrate tab asks for four reference notes:
   - Lowest comfortable note
   - Highest comfortable note
   - Lowest "edge" (chest break / vocal floor)
   - Highest "edge" (head break / vocal ceiling)

   Hold each note for ~3 seconds and the app detects its pitch. Click **Save calibration** when all four are detected.

2. **Exercise.** The Exercise tab shows a generated exercise scaled to your range — a sustained tone, a 5-note scale, an arpeggio, or a siren. Click **Play reference** to hear the target tones, then **Record** to sing the exercise, then **Analyze**. You'll see:
   - A pitch chart overlaying your contour against the target notes
   - Playback of your own attempt, so you can A/B it against the reference
   - A scorecard in plain language: how many cents off each note you were, plus breath steadiness, tone clarity, and vibrato, each flagged 🟢/🟡/🔴 against a healthy range
   - Coaching feedback from Claude

   After the first session, the next exercise is chosen to train whatever the coach told you to work on — flat pitch gets you a scale, shaky breath gets you a sustained tone.

3. **Free-sing.** Same analysis pipeline as Exercise but without target notes — sing whatever you want, get feedback on pitch drift, breath, vibrato, and tone quality.

4. **Progress.** Charts trends across your sessions by date, with the healthy zone shaded on each panel: pitch accuracy, jitter, shimmer, HNR, vibrato rate and depth. Filter to exercises or free-sing.

## How it works

Pitch detection uses [torchcrepe](https://github.com/maxrmorrison/torchcrepe), a neural pitch tracker. The voiced part of your recording is split across the exercise's target notes to score each one in cents. Voice-quality measurements (jitter, shimmer, HNR, formants) come from [Praat](https://www.fon.hum.uva.nl/praat/) via [Parselmouth](https://parselmouth.readthedocs.io/). Vibrato rate and extent are extracted from an FFT of the pitch contour.

Coaching is a single call to [Claude](https://www.anthropic.com/claude) (`claude-sonnet-4-6` by default). Claude is given the measurements, the exercise spec, and your last five sessions — including the advice it gave you after each one — so it can follow up on its own coaching rather than starting cold every time. Feedback comes back as structured output via tool use (focus area, top issue, why, drill, encouragement), which is what makes the adaptive exercise selection and progress tracking possible. The UI is [Gradio](https://www.gradio.app/) running on `localhost`.

### Configuration

| Env var | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Also settable via the first-run setup screen. |
| `SINGING_COACH_MODEL` | `claude-sonnet-4-6` | Model used for coaching. |
| `SINGING_COACH_MAX_TOKENS` | `1024` | Max output tokens per coaching call. |
| `SINGING_COACH_TIMEOUT_S` | `60` | API timeout in seconds. |

## Costs

The coaching call is the only paid component. Per session: roughly 1-2K input tokens and up to 1K output tokens, plus prompt caching on the system prompt to amortize the measurement glossary across repeat sessions. At `claude-sonnet-4-6` pricing ($3/M input, $15/M output, ~$0.30/M cached reads), expect **~$0.01–0.02 per session** once the cache is warm. Heavy use of Free-sing with long passages can push higher.

A back-of-the-envelope estimate; refine after a few real sessions.

## Privacy

- Audio recordings and measurements stay on your machine under `~/.singing-coach/`.
- Only the structured measurements (numbers — cents off target, jitter, HNR, etc.) plus the exercise spec and recent session history are sent to the Anthropic API. **Your audio is never uploaded.**
- The API key is stored at `~/.singing-coach/.env` with mode 0600.

## Storage locations

| What | Where |
|---|---|
| Session database | `~/.singing-coach/sessions.db` |
| Recordings | `~/.singing-coach/recordings/YYYY-MM-DD/<uuid>.wav` |
| API key | `~/.singing-coach/.env` |
| Reference-tone cache | `~/.singing-coach/cache/` |

## Supported platforms

- macOS, Linux: tested.
- Windows: best-effort, untested.
- Mic: provided by the browser; no driver setup required.
- Disk: ~2 GB for torch + the torchcrepe model.

## Contributing

PRs welcome. Run tests with `uv run pytest`. The architecture is one file per responsibility under `src/singing_coach/`; each module has a matching `tests/test_<module>.py`. Data crossing module boundaries is a Pydantic model from `models.py`, `session_service.py` owns the record → analyze → coach → persist pipeline, and `app.py` is Gradio wiring only.

Changing the coaching prompt? Run the eval harness to check the coach still diagnoses planted problems correctly. It makes real API calls (a handful of cents):

```bash
uv run python evals/coach_eval.py
```

## License

MIT — see [LICENSE](LICENSE).

`praat-parselmouth` is licensed under GPL-3.0. The consensus for Python wrappers is that dynamic linking does not propagate the GPL to calling code, but be aware if you fork or redistribute.
