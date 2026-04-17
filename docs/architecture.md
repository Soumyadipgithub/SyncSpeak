# Architecture

SyncSpeak uses a **Three-Tier Bridge** architecture. Each tier handles what it does best and communicates with its neighbour through a well-defined protocol.

---

## Tier Overview

```
┌──────────────────────────────────────────────────────┐
│  Tier 2 — React Frontend  (src/renderer/)            │
│  User interface, device selection, conversation log  │
└──────────────────┬───────────────────────────────────┘
                   │  invoke() / listen()  — Tauri IPC
┌──────────────────▼───────────────────────────────────┐
│  Tier 1 — Rust Shell  (src-tauri/src/lib.rs)         │
│  Window, transparency, process supervisor, storage   │
└──────────────────┬───────────────────────────────────┘
                   │  stdin/stdout newline-delimited JSON
┌──────────────────▼───────────────────────────────────┐
│  Tier 3 — Python Sidecar  (python/sidecar_main.py)   │
│  Audio capture, VAD, STT, translation, TTS           │
└──────────────────────────────────────────────────────┘
```

---

## Tier 1 — App Shell (Rust / Tauri v2)

**File**: [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)

**Responsibilities**:
- Window lifecycle (1000 × 720, transparent, no decorations)
- Windows Acrylic blur effect via `window_vibrancy` crate
- Spawns the Python sidecar process on startup
- Bridges stdin/stdout JSON between Python and the React frontend
- Persists history and config to the OS app-data directory
- Can restart the sidecar without restarting the whole app

**App data directory** (Windows): `%APPDATA%\com.syncspeak.app\`
- `history.jsonl` — append-only translation history
- `config.json` — saved settings (API keys, device preferences)

**Dev vs production sidecar**:
- Dev (`debug_assertions = true`): runs `venv\Scripts\python.exe python\sidecar_main.py` directly
- Production (`release`): runs the bundled binary `binaries/syncspeaker-sidecar`

---

## Tier 2 — Dashboard (React 19 / TypeScript)

**Files**: [src/renderer/](../src/renderer/)

**Pages**:
| File | Purpose |
|------|---------|
| `pages/TranslatePage.tsx` | Main dashboard — mic/speaker selector, VAD slider, start/stop, live log |
| `pages/HistoryPage.tsx` | Past session viewer |
| `pages/VoicesPage.tsx` | Voice preview and selection |
| `pages/GuidePage.tsx` | Setup instructions |

**Components**:
| File | Purpose |
|------|---------|
| `components/TitleBar.tsx` | Draggable title bar + settings button |
| `components/TabBar.tsx` | Navigation tabs |
| `components/LiquidTerminal.tsx` | Scrolling conversation log (heard/translated/system entries) |
| `components/AnimatedBackground.tsx` | Ambient motion background |

**State**:
- `store/appStore.ts` — Zustand global state (`showSettings` flag)
- `TranslatePage.tsx` local state — `isTranslating`, `inputDevice`, `outputDevice`, devices lists, `logs`, `vadLevel`, `currentVolume`, `selectedSpeaker`, `sidecarStatus`

**Key behaviours**:
- Logs are capped at 100 entries (`.slice(-99)` on each append)
- Device list retry: 3 attempts at 1.2s / 2.4s / 3.6s backoff
- Each `utterance` event is auto-persisted via `save_history_entry` Tauri command
- Speaker and VAD threshold changes are sent to Python mid-stream without stopping

---

## Tier 3 — Python Sidecar

**Files**: [python/sidecar_main.py](../python/sidecar_main.py), [python/translator.py](../python/translator.py)

**Responsibilities**:
- Enumerate audio devices (deduplicated by name across WASAPI/MME/DirectSound)
- Capture microphone at 16 kHz int16 mono via `sounddevice.InputStream`
- Run webrtcvad to detect speech vs silence
- Send complete utterances to Sarvam Saarika v2.5 for STT
- Send Hindi text to Groq Llama 3.3 70B for translation with rolling context
- Synthesize English via Sarvam Bulbul v3 TTS
- Play translated audio to the selected output device (VB-Cable)
- Prevent TTS audio from feeding back into the mic pipeline

For the full audio pipeline, see [pipeline.md](pipeline.md).

---

## IPC Protocol

All communication between tiers uses **newline-delimited JSON**.

### Commands (React → Tauri → Python stdin)

React calls `invoke('send_sidecar_command', { cmd: JSON.stringify({...}) })`.  
Tauri writes `{cmd}\n` to Python stdin.

| `cmd` | Parameters | Action |
|-------|-----------|--------|
| `start` | `in_device`, `out_device`, `speaker`, `vad_threshold` | Start the translation pipeline |
| `stop` | — | Stop the pipeline; any active TTS stops immediately |
| `update_speaker` | `speaker: string` | Switch voice mid-stream (takes effect on next utterance) |
| `update_threshold` | `vad_threshold: float` | Update stored threshold value |
| `update_api_key` | `api_key: string` | Set Sarvam key, verify it, emit `auth_result` |
| `update_groq_key` | `api_key: string` | Set Groq key, verify it with a 1-token test, emit `groq_auth_result` |
| `preview_voice` | `speaker`, `out_device`, `text` | Play local WAV cache or call TTS API |
| `list_devices` | `force_rescan: bool` | Return all input/output devices; `force_rescan` reinitializes PortAudio |
| `install_cable` | — | Download and launch VB-Cable installer |

**VAD threshold formula** (from `TranslatePage.tsx`):
```
vad_threshold = (120 - vadLevel) / 2000
```
At `vadLevel = 65` (default): `threshold = 0.0275`

### Events (Python stdout → Tauri → React `sidecar-event`)

Python calls `emit_event(type, **fields)` which writes `{"event": type, ...fields}\n` to stdout.  
Tauri parses and re-emits as a `sidecar-event` Tauri event.

| `event` | Fields | Meaning |
|---------|--------|---------|
| `ready` | — | Sidecar started; device list follows immediately |
| `devices` | `inputs: [{id, name}]`, `outputs: [{id, name}]` | Audio device enumeration result |
| `volume` | `level: float` (0–100) | RMS meter update, ~10× per second |
| `status` | `message: string` | Pipeline state: `READY`, `LIVE`, `Hearing...`, `Thinking...`, `FAULT` |
| `utterance` | `hindi: string`, `english: string` | Translation result; triggers history save |
| `error` | `message: string` | Non-fatal error; UI shows it as `[CRITICAL]` |
| `trace` | `message: string` | Debug/diagnostic info |
| `auth_result` | `status: string`, `message?: string` | Sarvam key verification result |
| `groq_auth_result` | `status: string`, `message?: string` | Groq key verification result |
| `install_status` | `message: string` | VB-Cable download/install progress |
| `install_done` | `message: string` | VB-Cable install complete |

### Tauri Commands (React → Rust, bypassing Python)

| Command | Parameters | Returns | Purpose |
|---------|-----------|---------|---------|
| `send_sidecar_command` | `cmd: string` | `()` | Write command JSON to Python stdin |
| `restart_sidecar` | — | `()` | Kill Python, spawn a fresh instance |
| `save_history_entry` | `session_id`, `hindi`, `english`, `timestamp` | `()` | Append entry to `history.jsonl` |
| `get_history` | — | `Value[]` | Read all history entries (latest first) |
| `clear_history` | — | `()` | Delete `history.jsonl` |
| `save_config` | `key: string`, `value: string` | `()` | Write key to `config.json` |
| `get_config` | `key: string` | `string?` | Read key from `config.json` |

---

## File Map

```
SyncSpeak/
│
├── README.md                    ← Product overview (public GitHub landing page)
├── CLAUDE.md                    ← Developer + AI agent guide (design rules, key behaviours)
├── CONTRIBUTING.md              ← How to contribute (workflow, rules, PR checklist)
├── CHANGELOG.md                 ← Version history
├── SECURITY.md                  ← Security model + vulnerability reporting
├── CODE_OF_CONDUCT.md           ← Contributor Covenant
├── LICENSE                      ← MIT
│
├── docs/                        ← Technical documentation (this folder)
│   ├── architecture.md          ← This file — three-tier design + IPC protocol
│   ├── pipeline.md              ← Audio pipeline deep dive
│   ├── api-reference.md         ← Sarvam AI + Groq API reference
│   ├── setup.md                 ← Installation and first-run guide
│   └── design-system.md         ← Liquid Glass CSS tokens and rules
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md        ← Structured bug report form
│   │   └── feature_request.md   ← Structured feature request form
│   └── PULL_REQUEST_TEMPLATE.md ← PR checklist (enforces CLAUDE.md rules)
│
├── package.json                 ← Node project config (version: 2.0.0)
├── vite.config.ts               ← Vite bundler config
├── tsconfig.json                ← TypeScript config
├── requirements.txt             ← Python dependencies
├── Start_SyncSpeak.bat          ← One-click launcher (checks engine, runs npm run dev)
├── Test_Pipeline.bat            ← One-click diagnostic runner
│
├── python/                      ← Tier 3: Audio Engine
│   ├── sidecar_main.py          ← Main sidecar: command loop, VAD, pipeline orchestration
│   ├── translator.py            ← API wrappers: STT, TTS, HTTP session, pipelining
│   └── test_pipeline.py         ← Diagnostic test suite
│
├── src/
│   └── renderer/                ← Tier 2: React Frontend
│       ├── main.tsx             ← React DOM entry point
│       ├── App.tsx              ← Root component, tab routing
│       ├── App.css              ← Root layout styles
│       ├── index.html           ← HTML shell
│       ├── components/
│       │   ├── TitleBar.tsx     ← Draggable title bar + settings button
│       │   ├── TabBar.tsx       ← Tab navigation
│       │   ├── LiquidTerminal.tsx   ← Conversation log component
│       │   └── AnimatedBackground.tsx
│       ├── pages/
│       │   ├── TranslatePage.tsx    ← Main dashboard
│       │   ├── HistoryPage.tsx
│       │   ├── VoicesPage.tsx
│       │   └── GuidePage.tsx
│       ├── modals/
│       │   └── SettingsModal.tsx    ← API key entry + device config
│       ├── store/
│       │   └── appStore.ts          ← Zustand global state
│       ├── hooks/
│       │   └── useSidecar.ts        ← Sidecar event listener hook
│       └── styles/
│           ├── globals.css          ← CSS design tokens
│           └── animations.css       ← Spring animation keyframes
│
├── src-tauri/                   ← Tier 1: Rust Shell
│   ├── src/
│   │   ├── lib.rs               ← Tauri commands, sidecar spawn, IPC bridge
│   │   └── main.rs              ← Binary entry point
│   ├── Cargo.toml               ← Rust dependencies
│   ├── tauri.conf.json          ← Tauri window + bundle config
│   └── icons/                   ← App icons (32×32, 128×128, ico, icns)
│
├── resources/
│   └── samples/                 ← Voice preview WAV cache (zero tokens on preview)
│       └── {speaker}.wav        ← One file per voice (shubh.wav, ritu.wav, ...)
│
├── binaries/                    ← Bundled production sidecar binary (PyInstaller output)
│   └── syncspeaker-sidecar-*    ← Platform-specific binary name
│
└── venv/                        ← Python virtual environment (not committed to git)
    └── Scripts/
        └── python.exe           ← Used by Start_SyncSpeak.bat and lib.rs in dev mode
```
