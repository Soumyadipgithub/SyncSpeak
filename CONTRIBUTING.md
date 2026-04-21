# Contributing to SyncSpeak

Thank you for your interest in contributing. This document covers the workflow, design rules, and things to know before opening a PR.

---

## Before you start

Read [CLAUDE.md](CLAUDE.md) first. It contains the design contract, key behaviours that must not be broken, and the full tech stack. It is short and worth reading entirely.

---

## Development setup

```bash
git clone https://github.com/Soumyadipgithub/SyncSpeak.git
cd SyncSpeak

# Frontend + Tauri
npm install

# Python engine
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install webrtcvad-wheels   # Windows only — pre-built binary

# Run in dev mode
npm run dev
```

Two API keys are required. Enter them in Settings → AI Authentication on first launch. See [docs/setup.md](docs/setup.md) for a full walkthrough.

---

## Branch Strategy

### Two permanent branches

| Branch | Purpose | Who can merge into it |
|--------|---------|----------------------|
| `main` | Production — what users run | Maintainer only (via PR from `develop`) |
| `develop` | Integration — all PRs land here | Maintainer approval required on every PR |

`develop` is the **default branch**. Every PR you open must target `develop`, not `main`.  
The maintainer promotes `develop` → `main` when a release is ready.

### Your branch naming — required format

CI will **reject your PR automatically** if your branch name does not follow this format:

```
<type>/issue-<number>-<short-description>
<type>/<short-description>          ← if no issue exists
```

**Valid types:**

| Type | Use for |
|------|---------|
| `feat` | New functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behaviour change |
| `chore` | Build, deps, config |
| `hotfix` | Critical production fix (urgent) |

**Examples:**

```bash
feat/issue-12-add-hindi-punctuation
fix/issue-7-tts-feedback-loop
docs/update-pipeline-diagram
refactor/vad-state-cleanup
chore/upgrade-groq-sdk
hotfix/stt-400-error
```

Rules:
- All lowercase, hyphen-separated words
- No spaces, underscores, or capital letters in the description
- Include the issue number when one exists: `fix/issue-7-description`

### Full workflow

```
1. Fork the repo
2. Create your branch from develop:
      git checkout develop
      git pull origin develop
      git checkout -b feat/issue-42-your-feature

3. Make your changes and test:
      npm run dev

4. Push and open a PR → target: develop (not main)

5. CI runs automatically (branch name + Python + TypeScript + Rust checks)

6. Maintainer reviews and approves

7. Maintainer merges — your branch is auto-deleted

8. Periodically, maintainer merges develop → main for a release
```

### What NOT to do

- Do not open a PR against `main` — it will not be considered
- Do not push directly to `develop` or `main` — both are protected
- Do not name your branch `fix-thing` or `my-feature` — the CI branch check will fail

---

## What to work on

Check the [Issues](https://github.com/Soumyadipgithub/SyncSpeak/issues) tab. Issues labelled `good first issue` are self-contained and well-scoped.

If you want to add something not in the issue tracker, open an issue first to discuss — especially for provider swaps, architecture changes, or anything that touches the audio pipeline.

---

## Rules

### Do not break

These behaviours exist for specific reasons (documented in CLAUDE.md):

| Behaviour | File | Why |
|-----------|------|-----|
| `sd._terminate(); sd._initialize()` before stream open | `sidecar_main.py` | Fixes Windows WASAPI -9985 stale device error |
| `device=None` fallback | `sidecar_main.py` | Recovers when mic is held by Teams/Zoom |
| `_tts_active` flag in `audio_callback` | `sidecar_main.py` | Prevents TTS voice from being re-transcribed |
| VAD state reset after TTS | `sidecar_main.py` | Stops partial captures bleeding into next utterance |
| 500ms pre-buffer (`deque(maxlen=5)`) | `sidecar_main.py` | Prevents first syllable from being clipped |

### Design

- Every panel must use `var(--glass-bg)` + `backdrop-filter: var(--liquid-blur)` — no solid backgrounds
- Do not add Tailwind CSS
- Use `var(--liquid-morph)` for all CSS transitions
- Full token reference: [docs/design-system.md](docs/design-system.md)

### API providers

Do not swap out Sarvam AI or Groq without opening a discussion issue first. The choice of providers is documented in [docs/pipeline.md](docs/pipeline.md) with specific reasons for each.

### API keys

Keys are always entered via the Settings modal and saved to `%APPDATA%\com.syncspeak.app\config.json`. Do not add `.env` file support or environment variable fallbacks — the GUI-only flow is intentional.

---

## Commit style

Use short imperative subject lines:

```
fix: prevent TTS feedback loop during active translation
feat: add voice preview caching for offline playback
docs: update pipeline.md with v3 VAD architecture
```

No ticket numbers required.

---

## Questions

Open a [Discussion](https://github.com/Soumyadipgithub/SyncSpeak/discussions) for questions that aren't bug reports or feature requests.
