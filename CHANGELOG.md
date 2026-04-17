# Changelog

All notable changes to SyncSpeak are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] — Pipeline v3 (current)

### Added
- **webrtcvad** neural VAD replacing RMS threshold — Google's voice activity detection (used in Chrome/Meet) gives 92%+ accuracy at separating speech from background noise
- **500ms pre-buffer** (`deque(maxlen=5)`) to prevent opening syllables ("kya", "toh") from being clipped
- **Sarvam Saarika v2.5** STT replacing Groq Whisper — purpose-built for Hindi/Hinglish/Indian accents
- **Groq Llama 3.3 70B** translation with 5-utterance rolling context window for pronoun resolution
- **Sarvam Bulbul v3** TTS with sentence-level pipelining (zero gap between consecutive sentences)
- **GUI-only API key management** — keys entered in Settings modal, saved to `%APPDATA%\com.syncspeak.app\config.json`, auto-injected on every launch via `ready` event
- **HTTP session pooling** — persistent `requests.Session` reuses TCP/TLS connection to Sarvam across TTS calls (~150ms savings per call)
- **TTS feedback prevention** — `_tts_active` flag blocks mic capture during TTS playback; VAD state is reset after each utterance to prevent partial captures bleeding over
- **VB-Cable in-app installer** — downloads and launches the VB-Audio driver installer directly from the app's Guide page
- 14 Sarvam Bulbul v3 voices with local WAV preview cache (zero API tokens for cached previews)
- Hinglish correction table to fix Saarika phonetic mis-mappings of short English words
- Session-scoped translation history persisted as JSONL in app data directory
- Live VAD sensitivity slider with real-time threshold update (no restart needed)
- Live voice switching mid-stream (no restart needed)

### Changed
- Replaced Sarvam WebSocket pipeline (v1) with REST + Groq pipeline (v2→v3)
- Sidecar now runs as a Python script in dev mode and a PyInstaller binary in production
- `SARVAM_API_KEY` environment variable and `.env` file removed — all credentials via GUI

### Fixed
- Windows WASAPI -9985 error on stale device: `sd._terminate(); sd._initialize()` before every stream open
- Device fallback to `device=None` when selected mic is held by Teams or Zoom
- Ghost translation entries caused by TTS audio being re-captured by mic

---

## [1.0.0] — Pipeline v1

Initial release. Sarvam WebSocket-based STT + translation with ~68% accuracy on Hindi speech.
