# SyncSpeak: Developer Guide

Real-time Hindi-to-English voice translator for corporate meetings.

---

## Tech Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop shell | Tauri v2 (Rust) | `src-tauri/` |
| UI | React 19, TypeScript, Zustand | `src/renderer/` |
| Design | Custom "Liquid Glass" CSS — no Tailwind | `src/renderer/styles/` |
| Build | Vite 6 | `vite.config.ts` |
| VAD | webrtcvad (Google Neural VAD) | `python/sidecar_main.py` |
| STT | Sarvam Saarika v2.5 (REST) | `python/translator.py` |
| Translation | Groq Llama 3.3 70B | `python/sidecar_main.py` |
| TTS | Sarvam Bulbul v3 (REST, sentence-pipelined) | `python/translator.py` |

---

## Commands

```bash
npm run dev        # Start dev mode (Tauri + Vite + Python sidecar auto-launched)
npm run build      # Production build (Vite bundle + Tauri binary)
npx vite build     # Frontend build only (no Tauri)
```

---

## Project Structure

```
src-tauri/         # Rust: window, IPC bridge, history/config storage
src/renderer/      # React: UI
  pages/           # TranslatePage, HistoryPage, VoicesPage, GuidePage
  components/      # TitleBar, TabBar, LiquidTerminal, AnimatedBackground
  modals/          # SettingsModal
  store/           # appStore.ts (Zustand)
  styles/          # globals.css (design tokens), animations.css
python/            # Python: audio engine sidecar
  sidecar_main.py  # Command loop, VAD, pipeline orchestration
  translator.py    # Sarvam + Groq API wrappers, HTTP session, TTS pipelining
docs/              # Technical documentation (see below)
```

---

## Documentation

| File | What's inside |
|------|--------------|
| [docs/architecture.md](docs/architecture.md) | Three-tier design, full IPC command/event reference, file map |
| [docs/pipeline.md](docs/pipeline.md) | Audio pipeline deep dive (VAD → STT → LLM → TTS) |
| [docs/api-reference.md](docs/api-reference.md) | Sarvam AI + Groq endpoints, models, parameters |
| [docs/setup.md](docs/setup.md) | Installation, first-run, troubleshooting |
| [docs/design-system.md](docs/design-system.md) | Liquid Glass CSS tokens, component rules |

---

## Audio Pipeline (v3 — current)

```
Mic → webrtcvad (speech/silence detection)
    → Sarvam Saarika v2.5 REST (Hindi/Hinglish → text)
    → Groq Llama 3.3 70B (translation, 5-utterance rolling context)
    → Sarvam Bulbul v3 REST (text → speech, sentence-pipelined)
    → VB-Cable output → Google Meet / Zoom
```

Full details: [docs/pipeline.md](docs/pipeline.md)

---

## Design Rules (Liquid Glass)

The app uses `transparent: true` in Tauri. Every panel is a frosted-glass lens over the user's real desktop.

**Never:**
- Add solid background colors to any panel or root element
- Simulate wallpaper with gradients or blobs
- Use Tailwind CSS

**Always:**
- Use `var(--glass-bg)` + `backdrop-filter: var(--liquid-blur)` on every panel
- Use `var(--liquid-morph)` (`cubic-bezier(0.2, 0.8, 1.0, 1.0)`) for all transitions

Full token reference: [docs/design-system.md](docs/design-system.md)

---

## Key Behaviours — Do Not Break

| Behaviour | Where | Why |
|-----------|-------|-----|
| `sd._terminate(); sd._initialize()` before stream open | `sidecar_main.py` | Fixes Windows WASAPI -9985 stale device error |
| Device fallback to `device=None` | `sidecar_main.py` | Recovers when selected mic is held by Teams/Zoom |
| `_tts_active` flag blocks mic during TTS playback | `sidecar_main.py` | Prevents TTS voice from being re-transcribed as Hindi |
| VAD state reset after TTS | `_play_and_clear()` | Prevents partial TTS captures bleeding into next utterance |
| Hinglish corrections table | `sidecar_main.py` | Safety net for Saarika phonetic mis-mappings |
| 500ms pre-buffer (`deque(maxlen=5)`) | `sidecar_main.py` | Prevents first syllable ("kya", "toh") from being clipped |

---

## API Keys

Both keys are entered via the Settings modal and saved to `%APPDATA%\com.syncspeak.app\config.json`.  
On every launch, `TranslatePage.tsx` listens for the Python `ready` event and auto-injects both keys via `update_api_key` and `update_groq_key` commands. No `.env` file is needed.

---

## Status

- **Pipeline**: v3 active — webrtcvad + Saarika v2.5 + Groq Llama + Bulbul v3
- **Transparency**: True desktop transparency active (Neutral Charcoal Spec)
- **VB-Cable**: Physical installation required for meeting audio routing
- **Python venv**: Must include `groq` and `webrtcvad-wheels` in addition to `requirements.txt`
