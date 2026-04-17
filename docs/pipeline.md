# Audio Pipeline (v3)

This document describes the current end-to-end audio processing pipeline in SyncSpeak.

---

## Pipeline Overview

```
Microphone (Hindi speech)
        │
        ▼
webrtcvad — Voice Activity Detection
        │  speech detected
        ▼
Sarvam Saarika v2.5 — Speech-to-Text (Hindi/Hinglish)
        │  Hindi transcript
        ▼
Hinglish Corrections — word-level post-processing
        │  cleaned transcript
        ▼
Groq Llama 3.3 70B — Translation + context resolution
        │  English text
        ▼
Sarvam Bulbul v3 — Text-to-Speech (sentence-pipelined)
        │  audio
        ▼
VB-Cable Output → Google Meet / Zoom hears English
```

**Files**: [python/sidecar_main.py](../python/sidecar_main.py), [python/translator.py](../python/translator.py)

---

## Stage 1: Audio Capture

**Config** (in `sidecar_main.py`):
- Sample rate: 16 000 Hz
- Channels: 1 (mono)
- Bit depth: int16
- Block size: 1 600 samples = 100 ms per callback

**PortAudio stability fix** (Windows WASAPI -9985 error):  
Before opening the stream, `sd._terminate()` + `sd._initialize()` forces PortAudio to re-enumerate devices. This clears stale WASAPI state from Teams/Zoom holding device handles between sessions.

**Device fallback**: If the user-selected device fails to open (`PortAudioError`), the pipeline falls back to `device=None` (OS default mic) and logs a trace message.

---

## Stage 2: Voice Activity Detection (webrtcvad)

**Library**: `webrtcvad-wheels` (Google's WebRTC VAD, aggressiveness level 2)  
**Fallback**: If not installed, falls back to RMS threshold silently.

**How it works**:
Each 100 ms audio callback chunk is split into five 20 ms frames. webrtcvad classifies each frame as speech or non-speech. A chunk is considered speech if the majority of frames are speech **and** the RMS level is above 0.002 (energy floor prevents dead-silent false positives).

```
100ms chunk → [20ms, 20ms, 20ms, 20ms, 20ms]
               each frame → vad.is_speech() → True/False
               majority True + rms > 0.002 → is_speech = True
```

**Pre-buffer** (`deque(maxlen=5)` = 500 ms):  
The 5 chunks immediately before speech onset are prepended to the utterance. This prevents the first syllable ("kya", "toh") from being clipped when the VAD triggers.

**End-of-utterance**: 8 consecutive silent chunks (800 ms) signal sentence boundary. The trailing 8 silent chunks are stripped; the remaining speech must be ≥ 3 chunks (300 ms) to be sent for STT.

**VAD state variables** (per session, in `_async_stream_loop`):
```python
SILENCE_CHUNKS = 8          # 800ms silence → sentence boundary
_vad_speaking    = [False]  # currently in a speech segment
_vad_silence_cnt = [0]      # consecutive silent chunks since speech ended
_vad_buffer      = []       # accumulates current utterance chunks
_vad_pre_buf     = deque(maxlen=5)  # 500ms pre-speech buffer
```

---

## Stage 3: Speech-to-Text (Sarvam Saarika v2.5)

**Endpoint**: `POST https://api.sarvam.ai/speech-to-text`  
**Model**: `saarika:v2.5`  
**Function**: `speech_to_text(wav_bytes)` in `translator.py`

The numpy int16 PCM array is wrapped in a standard RIFF WAV header by `_pcm_to_wav_bytes()` (in `sidecar_main.py`) before being sent:

```python
files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
data  = {"model": "saarika:v2.5", "language_code": "hi-IN"}
```

**Why Saarika instead of Whisper**:  
Saarika v2.5 is purpose-built for Indian languages and accents. Groq Whisper (`large-v3`) would phonetically mis-map short English words spoken in Hinglish into Hindi characters (e.g., "ok ok" → "पेव"), because Whisper treats everything as Hindi when `language="hi"` is set.

**Output**: Hindi or Hinglish transcript string.

---

## Stage 4: Hinglish Corrections

**Function**: `_apply_hinglish_corrections(text)` in `sidecar_main.py`

Even with Saarika, some common English words used in Indian corporate speech (filler words, meeting terms) can be transcribed as their Hindi phonetic equivalents. A word-level lookup table corrects these before translation:

```python
_HINGLISH_CORRECTIONS = {
    "पेव": "ok", "ओके": "ok",
    "हेलो": "hello", "यस": "yes",
    "मीटिंग": "meeting", "अपडेट": "update",
    ...
}
```

The table is applied as a word-by-word replacement. Unknown words pass through unchanged. This is a safety net — Saarika handles most Hinglish natively without needing it.

---

## Stage 5: Translation (Groq Llama 3.3 70B)

**Model**: `llama-3.3-70b-versatile` via Groq API  
**Temperature**: 0.1 (low for consistency)  
**Max tokens**: 300

**Why Groq Llama instead of a pure translation API**:  
A pure translation API translates each sentence independently. In a live meeting, pronouns like "woh" (he/she/they) or "unka" (their) refer to people mentioned in earlier sentences. Llama has a rolling 5-utterance conversation history, so it can resolve "woh" → "the client" when the client was mentioned two sentences ago.

**Two-step prompt** (`_MEETING_PROMPT` in `sidecar_main.py`):

```
STEP 1 — TRANSLATE:
• Pure Hindi → translate word-for-word
• Hinglish (mixed) → translate Hindi words, keep English words exactly as spoken
• Already English → output exactly as-is

STEP 2 — CONTEXTUALIZE (only if needed):
• Replace vague pronouns using conversation history, only if clearly identifiable

STRICT RULES:
• Output only the final English — no notes, no explanations
• Never add words not spoken (proportional length)
• Never use history to add new content (history is for pronouns only)
• Questions: add "?" if input starts with kya/kaisa/kahan/kyun/kab/kaun
• Preserve proper nouns, company names, numbers exactly
```

**Rolling context** (last 5 English translations):
```python
context_str = "\n".join(f"  — {h}" for h in conversation_history[-5:])
```

Conversation history is reset each time the pipeline starts (each "Start Translation" press).

---

## Stage 6: TTS Feedback Prevention

**Problem**: The Bulbul TTS plays English audio through speakers/VB-Cable. If the microphone is in the same room (or the same VB-Cable loopback), it can pick up the English audio. Saarika (trained for Hindi) then produces garbled transcriptions of the English TTS, creating ghost translation entries.

**Fix**: A `_tts_active` flag blocks the VAD buffer during playback:

```python
def audio_callback(...):
    if _tts_active[0]:
        return   # discard all mic input while TTS is playing
```

The flag is set/cleared by a `_play_and_clear` wrapper around `play_tts_pipelined`. After playback, the VAD state (`_vad_buffer`, `_vad_speaking`, `_vad_silence_cnt`) is reset so no partial captures from the TTS period bleed into the next utterance.

---

## Stage 7: Text-to-Speech (Sarvam Bulbul v3)

**Endpoint**: `POST https://api.sarvam.ai/text-to-speech`  
**Model**: `bulbul:v3`  
**Function**: `play_tts_pipelined(text, out_device, speaker)` in `translator.py`

**Parameters used**:
```python
{
    "inputs": [english_text],
    "target_language_code": "en-IN",
    "speaker": speaker,           # e.g. "shubh"
    "model": "bulbul:v3",
    "speech_sample_rate": 22050,
    "temperature": 0.7,
    "pace": 1.1                   # slightly faster than natural
}
```

**Response**: `{"audios": ["<base64_wav_string>"]}`  
`decode_base64_audio()` decodes base64 → WAV bytes → float32 numpy array.

### Sentence Pipelining

For multi-sentence translations, TTS synthesis of sentence N+1 runs in a background thread while sentence N is playing. This eliminates gaps between sentences and reduces total time to first audio.

```
t=  0ms: submit TTS(sentence 0)
t=850ms: TTS(s0) ready → begin PLAY(s0) + submit TTS(s1) simultaneously
t=2850ms: PLAY(s0) done → begin PLAY(s1) [already synthesized, no wait]
t=4850ms: PLAY(s1) done → begin PLAY(s2) [already synthesized, no wait]
```

Uses `concurrent.futures.ThreadPoolExecutor(max_workers=2)`.  
`playback_lock` (a `threading.Lock()`) prevents concurrent `sd.play()` calls on the same device.

Single-sentence translations skip the pipelining logic (fast path).

---

## Audio Routing (VB-Cable)

```
Python sd.play() → CABLE Output (VB-Audio)
                        │ internal loopback
                        ▼
                   CABLE Input (appears as microphone to OS)
                        │
                        ▼
                   Google Meet / Zoom
                   (set "CABLE Input" as microphone in settings)
```

VB-Cable is a Windows virtual audio device driver. It creates a hardware loopback: audio written to "CABLE Output" immediately appears on "CABLE Input". Meeting software configured to use "CABLE Input" as its microphone will receive the translated English audio.

---

## HTTP Session Pooling

All REST calls to `api.sarvam.ai` go through a persistent `requests.Session` created once at module load in `translator.py`:

```python
_http_session = requests.Session()
_http_session.headers.update({"api-subscription-key": API_KEY})
```

This reuses the TCP+TLS connection across calls, eliminating ~150 ms reconnection overhead per utterance. When the user updates their Sarvam API key in settings, `set_api_key()` updates both the module-level variable and the session headers atomically.

---

## Pipeline Version History

| Version | VAD | STT | Translation | Accuracy |
|---------|-----|-----|-------------|----------|
| v1 | Sarvam server-side (WebSocket) | Saaras v3 WebSocket | Sarvam server-side | ~68% |
| v2 | RMS threshold | Groq Whisper large-v3 | Groq Llama 3.3 70B | ~82% |
| v3 (current) | webrtcvad (Google) | Sarvam Saarika v2.5 | Groq Llama 3.3 70B | ~90%+ |

**Why v3 is better than v2**:
- webrtcvad (neural) vs RMS threshold: eliminates ghost translations from noise, chair scrapes, breath sounds
- Saarika v2.5 vs Whisper: purpose-built for Hindi/Hinglish/Indian accents; handles "ok ok", "kya", Hinglish naturally without phonetic Hindi mis-mapping
- Both v2 and v3 use Groq Llama for translation — this component was correct and unchanged
