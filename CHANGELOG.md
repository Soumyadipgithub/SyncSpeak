# Changelog

All notable changes to Sync Speak are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [3.0.0] — Public Launch (current)

### Added
- **Pipeline v3** — webrtcvad neural VAD + Sarvam Saarika v2.5 STT + Groq Llama 3.3 70B translation + Sarvam Bulbul v3 TTS with sentence-level pipelining
- **500ms pre-buffer** (`deque(maxlen=5)`) to prevent opening syllables ("kya", "toh") from being clipped
- **5-utterance rolling context** window for pronoun resolution across meeting flow
- **GUI-only API key management** — keys entered in Settings modal, saved to `%APPDATA%\com.syncspeak.app\config.json`, auto-injected on every launch via `ready` event
- **HTTP session pooling** — persistent `requests.Session` reuses TCP/TLS connection to Sarvam across TTS calls (~150 ms savings per call)
- **TTS feedback prevention** — `_tts_active` flag blocks mic capture during TTS playback; VAD state is reset after each utterance
- **VB-Cable in-app installer** — downloads and launches the VB-Audio driver installer from the app's Guide page
- **14 Sarvam Bulbul v3 voices** with local WAV preview cache (zero API tokens for cached previews)
- **Hinglish correction table** to fix Saarika phonetic mis-mappings of short English words
- **Session-scoped translation history** persisted as JSONL in app data directory
- **Live VAD sensitivity slider** and **live voice switching** — no restart needed
- **GitHub star button** in Settings → About
- **Marketing website** — Astro site at `syncspeak.soumg.workers.dev`, deployed on Cloudflare Workers, rebuilt on every push to `main` with preview versions for non-production branches
- **CI pipeline** — 6-job GitHub Actions: branch naming, Python syntax, TypeScript + Vite build, Rust `cargo check`, website build, asset-health (5 MB block + secrets scan)
- **AI-SEO** — `robots.txt`, `llms.txt`, `llms-full.txt`, canonical URLs, JSON-LD, sitemap

### Changed
- Brand name standardised to **Sync Speak** (two words) across all user-facing surfaces
- Version unified to 3.0.0 across app binary, Cargo crate, npm package, Tauri config, and website metadata
- Sidecar runs as a Python script in dev mode and a PyInstaller binary in production
- `SARVAM_API_KEY` environment variable and `.env` file removed — all credentials via GUI

### Fixed
- Windows WASAPI -9985 error on stale device: `sd._terminate(); sd._initialize()` before every stream open
- Device fallback to `device=None` when selected mic is held by Teams or Zoom
- Ghost translation entries caused by TTS audio being re-captured by mic
- CI branch-name check no longer rejects `main → develop` syncback PRs
