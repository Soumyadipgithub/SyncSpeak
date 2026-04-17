# Setup Guide

---

## Prerequisites

| Tool | Version | Why | Install |
|------|---------|-----|---------|
| Node.js | 20+ | Frontend build + Tauri CLI | https://nodejs.org |
| Rust + Cargo | stable | Tauri shell compilation | https://rustup.rs |
| Python | 3.10+ | Audio engine sidecar | https://python.org |
| VB-Cable | any | Virtual mic for meeting routing | https://vb-audio.com/Cable |
| Sarvam AI key | — | STT + TTS | https://dashboard.sarvam.ai |
| Groq key | — | Translation (Llama 3.3 70B) | https://console.groq.com |

**Two API keys are required.** There is no way to run the full pipeline with only one.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Soumyadipgithub/SyncSpeak.git
cd SyncSpeak
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Set up Python virtual environment

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Install webrtcvad

webrtcvad requires a pre-built wheel on Windows (the source package needs a C compiler):

```bash
venv\Scripts\pip install webrtcvad-wheels
```

### 5. API keys — entered in the app

Both API keys are entered through the app's Settings modal on first launch. No `.env` file is needed.

- **Sarvam key**: Settings → AI Authentication → Sarvam API Key → Activate
- **Groq key**: Settings → AI Authentication → Groq API Key → Activate

Keys are saved to `%APPDATA%\com.syncspeak.app\config.json` and automatically re-injected into the Python engine on every subsequent launch. You only enter them once.

### 6. Install VB-Cable

VB-Cable is a Windows virtual audio driver. You can install it either:
- Manually from https://vb-audio.com/Cable
- Via the app's Guide tab (click "Install VB-Cable" — it downloads and launches the installer automatically)

After installation, set your microphone to `CABLE Input (VB-Audio)` in Google Meet / Zoom settings.

---

## Running

### Development mode

```bash
npm run dev
```

This starts both the Vite dev server and the Tauri shell. The Python sidecar launches automatically from `venv\Scripts\python.exe python\sidecar_main.py`.

### One-click launcher (alternative)

```bash
Start_SyncSpeak.bat
```

This batch file:
1. Adds Rust/Cargo to the PATH
2. Verifies Python engine dependencies (auto-installs if missing)
3. Runs `npm run dev`

### Production build

```bash
npm run build
```

This runs `npx vite build` then `tauri build`. The bundled app includes the Python sidecar compiled to a native binary by PyInstaller (`binaries/syncspeaker-sidecar`).

---

## First Launch

1. The app opens with a glass UI showing "READY"
2. Enter your Groq key in Settings → Groq Authentication
3. Enter your Sarvam key in Settings → Sarvam Authentication
4. Click ↻ to scan audio devices
5. Select your microphone from Input Settings
6. Select "CABLE Output (VB-Audio)" from Output Settings — a "Ready" badge appears
7. Select a voice (click "Sample" to preview)
8. Click **START TRANSLATION**
9. Speak Hindi — you will see "Hearing..." → "Thinking..." → English text in the log

---

## Diagnostics

Run the test suite to verify each component individually:

```bash
Test_Pipeline.bat
```

Or directly:

```bash
venv\Scripts\python.exe python\test_pipeline.py
```

---

## Troubleshooting

### "Engine offline" / devices not loading

The Python sidecar failed to start. Likely causes:
- Missing `groq` package: `venv\Scripts\pip install groq`
- Missing `webrtcvad-wheels`: `venv\Scripts\pip install webrtcvad-wheels`
- Missing `sarvamai`: `venv\Scripts\pip install sarvamai`

### PortAudio error -9985 (device unavailable)

Another app (Teams, Zoom, Discord) is holding the microphone. Either:
- Close the other app and click ↻ to rescan
- Or select a different microphone from the dropdown

The pipeline automatically calls `sd._terminate()` + `sd._initialize()` before each stream open to clear stale WASAPI state.

### STT 400 error

The Sarvam API returned 400. Common causes:
- Wrong model name (must be `saarika:v2.5` — older `saarika:v2` is deprecated)
- Malformed WAV (rare — indicates a bug in `_pcm_to_wav_bytes`)

### "Good morning" translated to Hindi

This means Llama is reversing the translation direction. Check the system prompt in `_MEETING_PROMPT` — the "Already English → output as-is" rule must be present.

### Ghost translation entries

The TTS voice is being picked up by the microphone. This is handled automatically by the `_tts_active` flag (mic is blocked while TTS plays). If it still happens, it means the VB-Cable loopback is routing TTS audio back to the input device. Check your Windows audio routing — the input device (mic) and output device (CABLE Output) should not form a loop through Windows audio settings.

### Translations are too short / cut off

The webrtcvad pre-buffer (500 ms) catches speech onset. If very short words ("kya", "yes") are still being missed, try increasing Voice Sensitivity in the UI.

---

## Dependency Notes

### requirements.txt vs actual dependencies

The current `requirements.txt` reflects the full set of required packages. Two packages require manual installation because pip may have difficulty installing them on some systems:

- `webrtcvad-wheels` — installs via pip but must be the `-wheels` variant on Windows (not `webrtcvad` which requires a C compiler)
- `groq` — standard pip install

### Python version

Python 3.10 or higher is required. The `match`/`case` statement syntax used in some Tauri plugins requires 3.10+. Python 3.11 or 3.12 is recommended.

### Node version

Node.js 20 LTS is recommended. The `@tauri-apps/cli` v2 package requires Node 18+.
