# singing-coach

A personal AI voice coach. Record a vocal exercise or passage, get measurement-backed feedback, and track your progress over time. Coaching runs on a local model by default, so a practice session costs nothing. Your audio never leaves the machine that recorded it.

Inspired by [Vocal Range Explorer](https://github.com/dannybauman/Vocal-Range-Explorer), which detects vocal type but stops short of coaching.

![screenshot placeholder](docs/screenshot.png)

## Setup

You'll need [uv](https://docs.astral.sh/uv/) and [Ollama](https://ollama.com/).

```bash
git clone https://github.com/aboydnw/singing-coach.git
cd singing-coach
uv sync

ollama pull qwen2.5:3b   # the default coaching model

uv run singing-coach
```

First launch downloads the torchcrepe pitch model (~2 GB). Subsequent launches are fast.

Prefer Claude for coaching? Set `SINGING_COACH_BACKEND=anthropic` and supply an
[Anthropic API key](https://console.anthropic.com/) — via `.env`, or the setup screen the app
shows on first run. Coaching quality is noticeably better; see [Costs](#costs).

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

Coaching is a single model call. The model gets the measurements, the exercise spec, and your last five sessions — including the advice it gave you after each one — so it can follow up on its own coaching rather than starting cold every time. Feedback comes back as structured output (focus area, top issue, why, drill, encouragement), which is what makes the adaptive exercise selection and progress tracking possible. Both backends share one prompt and one schema; only the enforcement differs — Ollama constrains decoding to the JSON schema, Anthropic uses tool use. The UI is [Gradio](https://www.gradio.app/) running on `localhost`.

### Backup and sync

Optional, and off until you configure it. Point the app at a Supabase project and your calibration and session history are backed up as you sing, then pulled down on any other machine you sign into.

1. Create a Supabase project and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) against it. It creates the two tables plus the row-level-security policies that keep accounts apart.
2. Put the project URL and anon key in `~/.singing-coach/.env`.
3. Sign in on the **Account** tab.

Local SQLite stays the durable write path: singing works offline, and a failed sync never blocks coaching. Unsent rows queue up and go out on the next successful sync. Work done before you sign in is adopted into your account rather than stranded.

**Audio is never uploaded** — not to Supabase, not anywhere. Only measurements, the exercise spec and the coaching text sync. The local file path is stripped on upload too: it would leak your directory layout and means nothing on another machine. A session recorded elsewhere appears in Progress with its charts intact and its playback marked *recorded on another device*.

### Running it somewhere other than your laptop

The app binds loopback by default. To reach it from another machine, put a reverse proxy in front and let it bind locally:

```bash
sudo cp deploy/singing-coach.service /etc/systemd/system/   # edit User and paths first
sudo systemctl daemon-reload && sudo systemctl enable --now singing-coach
```

Then point [`deploy/Caddyfile`](deploy/Caddyfile) at your hostname for automatic HTTPS.

**Do not put a buffering proxy in front of this app.** Gradio delivers every event result over a long-lived SSE stream, so a proxy that buffers responses leaves the browser spinning on work the server already finished. The supplied Caddyfile sets `flush_interval -1` to disable buffering; nginx needs `proxy_buffering off;`. The same caveat applies to editor port-forwarding and tunnels — if the UI hangs on actions that the server logs as instant, suspect the transport before the app.

No proxy yet? `SINGING_COACH_SHARE=1` opens a temporary public Gradio tunnel, which is useful for testing but unauthenticated while it runs.

### Configuration

| Env var | Default | What it does |
|---|---|---|
| `SINGING_COACH_HOST` | `127.0.0.1` | Interface to bind. `0.0.0.0` to serve directly. |
| `SINGING_COACH_PORT` | first free | Port to bind. |
| `SINGING_COACH_SHARE` | `0` | `1` opens a public Gradio tunnel. |
| `SINGING_COACH_BACKEND` | `ollama` | `ollama` for local and free; `anthropic` for the API. |
| `SINGING_COACH_OLLAMA_MODEL` | `qwen2.5:3b` | Local coaching model. |
| `SINGING_COACH_OLLAMA_HOST` | `http://localhost:11434` | Where Ollama is listening. |
| `SINGING_COACH_OLLAMA_TIMEOUT_S` | `600` | Local generation timeout. CPU inference is slow. |
| `ANTHROPIC_API_KEY` | — | Required when the backend is `anthropic`. Also settable via the setup screen. |
| `SINGING_COACH_MODEL` | `claude-sonnet-4-6` | Claude model used for coaching. |
| `SINGING_COACH_MAX_TOKENS` | `1024` | Max output tokens per coaching call. |
| `SINGING_COACH_TIMEOUT_S` | `60` | Anthropic API timeout in seconds. |
| `SUPABASE_URL` | — | Supabase project URL. Backup stays off without it. |
| `SUPABASE_ANON_KEY` | — | Supabase anon key. |

## Costs

On the default local backend, **coaching is free** — no API calls, no per-session cost. You pay in latency and quality instead. On an 8-core CPU with no GPU, a coaching call takes roughly 25–30 seconds against a 3B model, versus a couple of seconds via the API.

Quality is the real trade. A 3B model tends to anchor on whatever it told you last session instead of re-reading the numbers, and it will occasionally describe a pitch problem as a breath problem. It is good enough to practise against and not good enough to trust blindly. Run `uv run python evals/coach_eval.py` against a backend to see how well it diagnoses planted problems before relying on it.

Switching to `anthropic` costs roughly **$0.01–0.02 per session** at `claude-sonnet-4-6` pricing ($3/M input, $15/M output, ~$0.30/M cached reads), with prompt caching amortizing the measurement glossary. Heavy Free-sing with long passages pushes higher.

## Privacy

- Audio recordings stay on the machine that recorded them, under `~/.singing-coach/`. **Your audio is never uploaded** — not for coaching, not for sync.
- On the default local backend, nothing leaves your machine at all.
- On the `anthropic` backend, only the structured measurements (cents off target, jitter, HNR, etc.), the exercise spec and recent session history are sent to the API.
- With sync on, those same measurements plus the coaching text go to your own Supabase project, guarded by row-level security. The local audio path is stripped before upload.
- Credentials live at `~/.singing-coach/.env` with mode 0600. The Supabase refresh token is cached at `~/.singing-coach/session.json`, also 0600.

## Storage locations

| What | Where |
|---|---|
| Session database | `~/.singing-coach/sessions.db` |
| Recordings | `~/.singing-coach/recordings/YYYY-MM-DD/<uuid>.wav` |
| Credentials | `~/.singing-coach/.env` |
| Cached sign-in | `~/.singing-coach/session.json` |
| Reference-tone cache | `~/.singing-coach/cache/` |

Databases created before sync existed used autoincrementing integer ids, which collide once two
devices sync. On first launch those tables are renamed to `sessions_legacy_v1` and
`calibration_legacy_v1` and a fresh schema is created alongside them. Nothing is deleted; the old
rows are still queryable with any SQLite client.

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
