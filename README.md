# Sync Speak

> Real-time Hindi → English voice translator for corporate meetings.  
> Speak Hindi. Your colleagues hear English. Instantly.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8.svg)

---

## What does it do?

You speak Hindi into your mic. Sync Speak translates it to English and plays it through a virtual audio cable — so everyone in your Google Meet / Zoom hears natural English in real time.

---

## How it works

```
You speak Hindi
      ↓
Mic → webrtcvad (speech detection)
      ↓
Sarvam Saarika v2.5 (Hindi/Hinglish → text)
      ↓
Groq Llama 3.3 70B (translation with conversation context)
      ↓
Sarvam Bulbul v3 (English text → voice)
      ↓
VB-Cable virtual mic → Google Meet / Zoom hears English
```

Three layers that keep latency low:
- **webrtcvad** — Google's neural VAD (used in Chrome/Meet) separates speech from noise with 92%+ accuracy
- **HTTP session pooling** — reuses the TCP/TLS connection to Sarvam across TTS calls
- **Sentence pipelining** — synthesizes sentence 2 while sentence 1 is playing; zero gaps

---

## Prerequisites

| Tool | Why |
|------|-----|
| [Node.js 20+](https://nodejs.org) | Frontend build |
| [Rust + Cargo](https://rustup.rs) | Tauri shell |
| [Python 3.10+](https://python.org) | Audio engine sidecar |
| [VB-Cable](https://vb-audio.com/Cable) | Virtual mic (routes translated audio into meetings) |
| [Sarvam AI key](https://dashboard.sarvam.ai) | STT (Saarika v2.5) + TTS (Bulbul v3) |
| [Groq key](https://console.groq.com) | Translation (Llama 3.3 70B) |

> **Two API keys are required.** VB-Cable is a free Windows driver.

---

## Setup

**1. Clone and install**
```bash
git clone https://github.com/Soumyadipgithub/SyncSpeak.git
cd SyncSpeak
npm install
```

**2. Set up Python environment**
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install webrtcvad-wheels   # Windows pre-built wheel
```

**3. Run**
```bash
npm run dev
```

**4. Enter your API keys in the app**

Open Settings → AI Authentication → paste both keys → click Activate.
Keys are saved automatically and reloaded on every launch. No `.env` file needed.

For a full setup walkthrough, see [docs/setup.md](docs/setup.md).

---

## Project Structure

```
SyncSpeak/
├── python/                # Audio engine (webrtcvad + Sarvam + Groq)
│   ├── sidecar_main.py    # VAD, pipeline orchestration, command loop
│   └── translator.py      # API wrappers, TTS pipelining, HTTP session
├── src/renderer/          # React 19 UI (TypeScript)
│   ├── pages/             # TranslatePage, HistoryPage, VoicesPage
│   └── components/        # TitleBar, TabBar, LiquidTerminal
├── src-tauri/             # Rust / Tauri v2 shell
├── website/               # Marketing site (Astro) — syncspeak.soumg.workers.dev
└── docs/                  # Technical documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| UI | React 19, TypeScript, Zustand |
| Design | Custom "Liquid Glass" CSS (no Tailwind) |
| VAD | webrtcvad (Google Neural VAD) |
| STT | Sarvam Saarika v2.5 (REST) |
| Translation | Groq Llama 3.3 70B |
| TTS | Sarvam Bulbul v3 (REST) |
| Audio routing | sounddevice + VB-Cable |

---

## Voices

14 built-in voices (Sarvam Bulbul v3): `shubh`, `sumit`, `amit`, `manan`, `rahul`, `ratan`, `ritu`, `pooja`, `simran`, `kavya`, `priya`, `ishita`, `shreya`, `shruti`.

Local WAV previews cached in `resources/samples/` — no API tokens used for previews.

---

## Documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](docs/architecture.md) | Three-tier design, file map, full IPC protocol |
| [docs/pipeline.md](docs/pipeline.md) | Audio pipeline deep dive (VAD → STT → LLM → TTS) |
| [docs/api-reference.md](docs/api-reference.md) | Sarvam AI + Groq endpoints, models, parameters |
| [docs/setup.md](docs/setup.md) | Full installation and troubleshooting guide |
| [docs/design-system.md](docs/design-system.md) | Liquid Glass tokens, rules, component patterns |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, design rules, PR checklist |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow, design rules, and checklist.

Quick version:
1. Fork → branch → PR
2. Read [CLAUDE.md](CLAUDE.md) before making any changes — it has the design rules and key behaviours
3. Keep all panels as glass cards (no solid colors — see [docs/design-system.md](docs/design-system.md))
4. Do not swap out AI providers without discussion

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

---

## Website

The marketing site lives in [`website/`](website/) and is built with Astro.
It deploys to [syncspeak.soumg.workers.dev](https://syncspeak.soumg.workers.dev) (Cloudflare
Pages) on every push to `main`. See [`website/README.md`](website/README.md)
for local-dev commands.

---

## License

MIT — see [LICENSE](LICENSE)
