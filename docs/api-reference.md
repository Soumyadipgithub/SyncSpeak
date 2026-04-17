# API Reference

SyncSpeak uses two external AI services: **Sarvam AI** (STT and TTS) and **Groq** (translation).

---

## Authentication

### Sarvam AI

**Dashboard** (get your key): https://dashboard.sarvam.ai  
**Docs**: https://docs.sarvam.ai

All Sarvam calls require the header:
```
api-subscription-key: <your_sarvam_key>
```

The key is entered via the Settings modal in the app and saved to `%APPDATA%\com.syncspeak.app\config.json`. It is automatically re-injected into the Python engine on every launch. No `.env` file is needed.

### Groq

**Console** (get your key): https://console.groq.com  
**Docs**: https://console.groq.com/docs

Groq uses the standard Bearer token pattern handled by the `groq` Python SDK. The key is injected at runtime via the Settings modal (`update_groq_key` command) and stored in `config.json` by Tauri.

---

## Sarvam AI — Speech-to-Text (REST)

**Endpoint**: `POST https://api.sarvam.ai/speech-to-text`  
**Function**: `speech_to_text(wav_bytes)` in [translator.py](../python/translator.py)  
**Used for**: Transcribing Hindi/Hinglish mic audio

### Request

Multipart form data:

| Field | Value | Notes |
|-------|-------|-------|
| `file` | WAV bytes | RIFF WAV, int16, 16 kHz, mono |
| `model` | `"saarika:v2.5"` | Current model — v2 is deprecated |
| `language_code` | `"hi-IN"` | Source language |

### Response

```json
{"transcript": "transcribed text here"}
```

### Error codes

| Status | Cause |
|--------|-------|
| 400 | Wrong model name, missing field, or malformed WAV |
| 401/403 | Invalid API key |
| 429 | Rate limit exceeded |

### WAV format note

The Python sidecar captures audio as int16 PCM. Before sending, `_pcm_to_wav_bytes()` (in `sidecar_main.py`) wraps the raw PCM in a standard 44-byte RIFF WAV header. Do not send raw PCM bytes without the header.

---

## Sarvam AI — Text-to-Speech (REST)

**Endpoint**: `POST https://api.sarvam.ai/text-to-speech`  
**Function**: `synthesize_speech(text, speaker)` in [translator.py](../python/translator.py)  
**Used for**: Synthesizing the translated English text

### Request

JSON body:

| Field | Value | Notes |
|-------|-------|-------|
| `inputs` | `["text here"]` | Array of strings |
| `target_language_code` | `"en-IN"` | English (Indian accent) |
| `speaker` | e.g. `"shubh"` | See voice list below |
| `model` | `"bulbul:v3"` | TTS model |
| `speech_sample_rate` | `22050` | Output sample rate (Hz) |
| `temperature` | `0.7` | Voice variation (0.0–1.0) |
| `pace` | `1.1` | Speed multiplier (1.0 = natural) |

### Response

```json
{"audios": ["<base64_encoded_wav_string>"]}
```

`decode_base64_audio()` in `translator.py` decodes this to a float32 numpy array + sample rate tuple.

### Available Voices (Bulbul v3)

| ID | Gender | ID | Gender |
|----|--------|----|--------|
| `shubh` | Male | `ritu` | Female |
| `sumit` | Male | `pooja` | Female |
| `amit` | Male | `simran` | Female |
| `manan` | Male | `kavya` | Female |
| `rahul` | Male | `priya` | Female |
| `ratan` | Male | `ishita` | Female |
| — | — | `shreya` | Female |
| — | — | `shruti` | Female |

The female voice set is also tracked in `FEMALE_SPEAKERS` in `translator.py`.

---

## Sarvam AI — Translation (REST)

**Endpoint**: `POST https://api.sarvam.ai/translate`  
**Function**: `translate_text()` and `verify_api_key()` in [translator.py](../python/translator.py)  
**Used for**: API key verification only — **not** used in the main translation pipeline

The main pipeline uses Groq Llama for translation (see below). This endpoint is only called by `verify_api_key()` to confirm the Sarvam key is valid when the user first enters it.

### Request

```json
{
  "source_language_code": "hi-IN",
  "target_language_code": "en-IN",
  "input": "text to translate",
  "model": "mayura:v1"
}
```

---

## Groq — Llama 3.3 70B (Translation)

**SDK**: `groq` Python package  
**Docs**: https://console.groq.com/docs  
**Model**: `llama-3.3-70b-versatile`  
**Used for**: Translating Hindi/Hinglish transcripts to English with conversation context

### Request (via SDK)

```python
groq_client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "system", "content": system_prompt},  # includes rolling history
        {"role": "user",   "content": hindi_text}      # current utterance
    ],
    temperature=0.1,    # low for consistent formal output
    max_tokens=300
)
```

### Why Llama instead of a translation API

A pure translation API translates each sentence independently. Llama receives the last 5 translated English sentences as context, allowing it to resolve pronouns like "woh" (he/she/they) to the actual person mentioned in prior sentences. This is critical for natural-sounding corporate meeting translation.

### Prompt Design

The system prompt (`_MEETING_PROMPT` in `sidecar_main.py`) uses a two-step structure:

**Step 1 — Translate**: Handles pure Hindi, Hinglish (keep English parts, translate Hindi parts), and already-English input (pass through unchanged).

**Step 2 — Contextualize**: Replaces vague pronouns using rolling history, only when clearly identifiable.

**Strict rules** enforced in the prompt:
- Output only the final English text (no meta-commentary)
- Translation length must be proportional to input (no fabrication)
- History is for pronoun resolution only, never for adding new content
- Add `?` for interrogative patterns (kya, kaisa, kahan, kyun, kab, kaun)
- Preserve proper nouns, company names, and numbers exactly

### Key verification

The `update_groq_key` command verifies the Groq key by making a 1-token completion:
```python
test_client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "hi"}],
    max_tokens=1
)
```
This confirms both key validity and model access without costing significant tokens.

---

## Error Handling

All Sarvam REST calls go through `call_api_with_retry()` in `translator.py`:

1. First attempt: if status 200 → return; if 4xx → raise immediately (no retry); if other error → fall through to retry
2. Wait 100 ms
3. Second attempt: `raise_for_status()` on any non-200

The STT function (`speech_to_text`) bypasses this and makes a direct request, exposing the full Sarvam error response body in the exception message. This makes 400 errors debuggable from the app's TRACE log.

---

## Cost Notes

| Operation | API | Approximate cost |
|-----------|-----|-----------------|
| STT (per utterance) | Sarvam | Billed per minute of audio |
| Translation | Groq | Billed per token (input + output) |
| TTS (per sentence) | Sarvam | Billed per character |
| API key verification | Sarvam | ~1 call to `/translate` with "नमस्ते" |
| Voice preview (cached) | None | Free — plays local WAV file |
| Voice preview (uncached) | Sarvam | 1 TTS call |
