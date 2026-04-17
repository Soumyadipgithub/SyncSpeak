import re
import time
import wave
import threading
import concurrent.futures
import numpy as np
import sounddevice as sd
import requests
import io

# API key is injected at runtime via set_api_key(), called by the sidecar
# when the frontend sends the key saved from config.json on startup.
# No .env file or environment variable needed — keys are managed through the GUI.
API_KEY = None

# Persistent HTTP session: reuses TCP+TLS connections across all REST calls.
# Without this, each call opens a fresh socket (~150ms overhead).
# TTS is the only remaining REST call; session eliminates per-call connection cost.
_http_session = requests.Session()

def set_api_key(new_key):
    global API_KEY
    API_KEY = new_key
    _http_session.headers.update({"api-subscription-key": new_key})

BASE_URL = "https://api.sarvam.ai"

# Hardcoded Production Constants (Dashboard Settings)
SPEECH_SAMPLE_RATE = 22050
SPEECH_PACE = 1.1
SPEECH_TEMPERATURE = 0.7
SPEECH_MODEL = "bulbul:v3"

# Audio config for mic
SAMPLE_RATE = 16000
CHUNK_DURATION = 0.1

# Logic for female styles
FEMALE_SPEAKERS = {"ritu", "pooja", "simran", "kavya", "priya", "ishita", "shreya", "shruti"}

# Playback Lock to prevent crashes
playback_lock = threading.Lock()
_error_callback = None

def set_error_callback(callback):
    global _error_callback
    _error_callback = callback

def call_api_with_retry(method, url, **kwargs):
    kwargs.setdefault('timeout', 12)
    try:
        response = _http_session.request(method, url, **kwargs)
        if response.status_code == 200:
            return response
        if 400 <= response.status_code < 500:
            raise Exception(f"AI Server Error {response.status_code}: {response.text}")
        raise Exception(f"AI Server Error {response.status_code}: {response.text}")
    except Exception:
        time.sleep(0.1)  # Reduced from 500ms — fast retry for transient failures
        response = _http_session.request(method, url, **kwargs)
        response.raise_for_status()
        return response

def speech_to_text(wav_bytes: bytes) -> str:
    """
    Transcribe Hindi/Hinglish audio using Sarvam Saarika v2.
    Purpose-built for Indian languages — replaces Groq Whisper in the main pipeline.
    Input : raw WAV bytes (int16, 16 kHz, mono) from _pcm_to_wav_bytes()
    Output: transcribed text string (Hindi/Hinglish)
    """
    url   = f"{BASE_URL}/speech-to-text"
    files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
    data  = {
        "model":         "saarika:v2.5",
        "language_code": "hi-IN",
    }
    response = _http_session.request("POST", url, files=files, data=data, timeout=12)
    if response.status_code != 200:
        raise Exception(f"STT {response.status_code}: {response.text}")
    return response.json().get("transcript", "").strip()


def transcribe_audio(audio_buffer: np.ndarray) -> str:
    """Legacy STT — kept for API key verification only."""
    peak = np.abs(audio_buffer).max()
    if peak > 0.001:
        audio_buffer = audio_buffer * (0.9 / peak)

    audio_int16 = (audio_buffer * 32767).astype(np.int16)
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_int16.tobytes())

    response = call_api_with_retry(
        "POST", f"{BASE_URL}/speech-to-text",
        files={"file": ("audio.wav", wav_io.getvalue(), "audio/wav")},
        data={"model": "saarika:v2.5", "language_code": "hi-IN"}
    )
    return response.json().get("transcript", "")

def translate_text(hindi_text: str, speaker_gender: str = "Male") -> str:
    """Translation via REST. Kept for API key verification only — main pipeline uses WebSocket."""
    url = f"{BASE_URL}/translate"
    headers = {"api-subscription-key": API_KEY, "Content-Type": "application/json"}
    payload = {
        "source_language_code": "hi-IN",
        "target_language_code": "en-IN",
        "speaker_gender": speaker_gender,
        "input": hindi_text,
        "model": "mayura:v1",
        "mode": "formal"
    }
    response = call_api_with_retry("POST", url, headers=headers, json=payload)
    return response.json().get("translated_text", "")

def synthesize_speech(english_text: str, speaker: str = "shubh") -> bytes:
    """TTS: English text → base64 audio via Bulbul v3."""
    url = f"{BASE_URL}/text-to-speech"
    headers = {"api-subscription-key": API_KEY, "Content-Type": "application/json"}

    payload = {
        "inputs": [english_text.strip()],
        "target_language_code": "en-IN",
        "speaker": speaker,
        "model": SPEECH_MODEL,
        "speech_sample_rate": SPEECH_SAMPLE_RATE,
        "temperature": SPEECH_TEMPERATURE,
        "pace": SPEECH_PACE
    }

    response = call_api_with_retry("POST", url, headers=headers, json=payload)
    data = response.json()
    if "audios" not in data or not data["audios"]:
        raise Exception("API Error: No audio returned.")
    return data.get("audios", [])[0]

def verify_api_key() -> bool:
    """Validate API Key with a minimal translation request."""
    url = f"{BASE_URL}/translate"
    headers = {"api-subscription-key": API_KEY, "Content-Type": "application/json"}
    payload = {
        "source_language_code": "hi-IN",
        "target_language_code": "en-IN",
        "input": "नमस्ते",
        "model": "mayura:v1"
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=(2, 4))
        if response.status_code == 200:
            return True
        if response.status_code in (401, 403):
            raise Exception("Invalid API Key (Unauthorized)")
        raise Exception(f"API Error {response.status_code}: {response.text}")
    except requests.exceptions.Timeout:
        raise Exception("Authentication Timeout (Check Internet)")
    except requests.exceptions.RequestException as e:
        raise Exception(f"Connection Failed: {str(e)}")

def decode_base64_audio(base64_string: str) -> tuple:
    """Decode base64 audio → (audio_data_float32, sample_rate)."""
    import base64
    audio_bytes = base64.b64decode(base64_string)
    with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
        sample_rate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
    audio_data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return audio_data, sample_rate


# ─────────────────────────────────────────────────────────────
# LAYER 3: Sentence-level TTS Pipelining
#
# Problem: Full translated text → one TTS call → wait for all → play.
#          For 2-3 sentences, listener waits ~2s of dead air.
#
# Fix: Split at sentence boundaries. Synthesize sentence N+1 in a
#      background thread while sentence N is playing. By the time
#      sentence N finishes, N+1 is already ready → zero gap.
#
# Timeline (3 sentences, ~1s TTS each, ~2s playback each):
#   Old: TTS(1)→play(1)→TTS(2)→play(2)→TTS(3)→play(3) = 9s
#   New: TTS(1)→[play(1)+TTS(2)]→[play(2)+TTS(3)]→play(3) = 7s
#        + first sentence plays ~1s earlier than old approach
# ─────────────────────────────────────────────────────────────

def _split_sentences(text: str) -> list:
    """Split English text at natural sentence boundaries."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]

def play_tts_pipelined(english_text: str, out_device: int, speaker: str):
    """
    Play translated English with sentence-level TTS pipelining.
    Sentence N+1 synthesizes during playback of sentence N — no gaps.
    """
    sentences = _split_sentences(english_text)

    if len(sentences) <= 1:
        audio_b64 = synthesize_speech(english_text.strip(), speaker=speaker)
        p_data, fs = decode_base64_audio(audio_b64)
        with playback_lock:
            sd.play(p_data, samplerate=fs, device=out_device, blocking=True)
        return

    # Pipeline: 2 workers — one playing, one synthesizing next
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        # Pre-submit first sentence immediately
        next_future = executor.submit(synthesize_speech, sentences[0], speaker)

        for i in range(len(sentences)):
            audio_b64 = next_future.result()  # Wait for current TTS

            # Submit next sentence synthesis NOW (overlaps with playback below)
            if i + 1 < len(sentences):
                next_future = executor.submit(synthesize_speech, sentences[i + 1], speaker)

            p_data, fs = decode_base64_audio(audio_b64)
            with playback_lock:
                sd.play(p_data, samplerate=fs, device=out_device, blocking=True)
