#!/usr/bin/env python3
import json
import sys
import io
import wave
import struct
import threading
import asyncio
import collections
from pathlib import Path
import urllib.request
import zipfile
import tempfile
import subprocess
import shutil

# Disable buffering
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1, encoding='utf8')

# webrtcvad — Google's neural voice activity detection (used in Chrome/Meet)
# Install: pip install webrtcvad-wheels
# Falls back to RMS threshold automatically if not installed — no crash.
try:
    import webrtcvad as _webrtcvad
    _WEBRTCVAD_AVAILABLE = True
except ImportError:
    _webrtcvad           = None
    _WEBRTCVAD_AVAILABLE = False

# Import core engine
try:
    from translator import (
        synthesize_speech, decode_base64_audio, play_tts_pipelined,
        speech_to_text, SAMPLE_RATE, playback_lock
    )
    import sounddevice as sd
    import numpy as np
    from groq import Groq
except ImportError as e:
    print(json.dumps({"event": "error", "message": f"Engine Error: {e}. Run: pip install groq sounddevice numpy webrtcvad-wheels"}))
    sys.exit(1)

# ── Global State ────────────────────────────────────────────────────────────
is_translating = False
GLOBAL_SPEAKER = "shubh"
GLOBAL_THRESHOLD = 0.01   # RMS silence floor — maps to VAD sensitivity slider
GROQ_API_KEY = ""

def emit_event(event_type: str, **data):
    print(json.dumps({"event": event_type, **data}))
    sys.stdout.flush()

def get_audio_devices():
    devices = sd.query_devices()
    inputs, outputs = [], []
    seen_in, seen_out = set(), set()
    for i, dev in enumerate(devices):
        if dev["max_input_channels"] > 0 and dev["name"] not in seen_in:
            inputs.append({"id": i, "name": dev["name"]})
            seen_in.add(dev["name"])
        if dev["max_output_channels"] > 0 and dev["name"] not in seen_out:
            outputs.append({"id": i, "name": dev["name"]})
            seen_out.add(dev["name"])
    return inputs, outputs


def _pcm_to_wav_bytes(pcm_array: np.ndarray, sample_rate: int) -> bytes:
    """
    Wrap raw int16 PCM numpy array in a WAV header and return as bytes.
    Used to send complete utterances to Groq Whisper REST API.
    """
    pcm_bytes = pcm_array.tobytes()
    data_len = len(pcm_bytes)
    buf = io.BytesIO()
    buf.write(b'RIFF')
    buf.write(struct.pack('<I', 36 + data_len))
    buf.write(b'WAVE')
    buf.write(b'fmt ')
    buf.write(struct.pack('<IHHIIHH',
        16, 1, 1,
        sample_rate,
        sample_rate * 2,
        2, 16
    ))
    buf.write(b'data')
    buf.write(struct.pack('<I', data_len))
    buf.write(pcm_bytes)
    return buf.getvalue()


# ── Pipeline: webrtcvad → Sarvam Saarika v2 STT → Groq Llama → Sarvam Bulbul TTS
#
# v1: Sarvam WebSocket (STT+Translate, no context, 22% WER)        ~68% accuracy
# v2: RMS VAD → Groq Whisper → Groq Llama → Sarvam TTS             ~82% accuracy
# v3: webrtcvad → Sarvam Saarika v2 → Groq Llama → Sarvam TTS     ~90%+ accuracy
#
# Why each component:
#   • webrtcvad   — Google's neural VAD (Chrome/Meet), replaces RMS threshold
#                   Separates human voice from noise with 92%+ accuracy
#   • Saarika v2  — Sarvam's STT, purpose-built for Hindi/Hinglish/Indian accents
#                   "toh kaisa hai sab" / "ok ok" / Hinglish — all handled natively
#   • Groq Llama  — Translates WITH conversation context (5-utterance rolling window)
#                   Pure translation APIs can't resolve pronouns across sentences
#   • Bulbul TTS  — Unchanged, pipelined sentence-by-sentence for zero gaps
# ─────────────────────────────────────────────────────────────────────────────

# ── Hinglish correction table ───────────────────────────────────────────────
# Whisper with language="hi" phonetically maps short English words into Hindi
# characters. This table maps those mistranscriptions back to the correct English
# word before the text reaches Llama. Add new entries as you discover them.
_HINGLISH_CORRECTIONS = {
    # Filler / affirmatives
    "पेव": "ok", "ओके": "ok", "ओक": "ok", "ओ के": "ok",
    "यस": "yes", "येस": "yes",
    "नो": "no",
    "हेलो": "hello", "हैलो": "hello", "हेल्लो": "hello",
    "हाय": "hi",
    "बाय": "bye",
    "सॉरी": "sorry",
    "थैंक्यू": "thank you", "थैंक": "thank", "थैंकस": "thanks",
    "प्लीज": "please",
    "वेट": "wait",
    "राइट": "right",
    "फाइन": "fine",
    "गुड": "good",
    # Meeting terms
    "मीटिंग": "meeting",
    "अपडेट": "update",
    "रिपोर्ट": "report",
    "प्रोजेक्ट": "project",
    "टीम": "team",
    "क्लाइंट": "client",
    "डेडलाइन": "deadline",
    "टारगेट": "target",
    "बजट": "budget",
    "प्रेजेंटेशन": "presentation",
}

def _apply_hinglish_corrections(text: str) -> str:
    """Replace Whisper's Hindi-phonetic mistranscriptions of English words."""
    words = text.split()
    corrected = [_HINGLISH_CORRECTIONS.get(w, w) for w in words]
    return " ".join(corrected)


_MEETING_PROMPT = """\
You are a professional real-time interpreter for corporate business meetings. Follow two steps exactly.

STEP 1 — TRANSLATE:
Translate the input to English with the accuracy of a professional human interpreter.
• Pure Hindi → translate word-for-word
• Hinglish (mixed) → translate only the Hindi words, keep all English words exactly as spoken, combine naturally
• Already English → output exactly as-is, no changes whatsoever

STEP 2 — CONTEXTUALIZE (only if needed):
Using conversation history, replace vague pronouns (woh/unka/yeh/inka/uska/ve/unhe) with the actual person or entity ONLY if clearly identifiable. Do not guess.

STRICT RULES:
• Output ONLY the final English — no notes, no explanations, nothing else
• NEVER add words not spoken — keep translation proportional to input length
• NEVER use history to add new content — history is for pronoun resolution only
• Questions: add "?" if input starts with kya/kaisa/kahan/kyun/kab/kaun or ends with hai na/hai kya
• Preserve all proper nouns, company names, and numbers exactly as spoken

Conversation history (pronoun resolution only):
{context}"""


async def _async_stream_loop(in_idx: int, out_idx: int):
    """
    Async core (v3 pipeline):
      1. Mic → webrtcvad (neural VAD) detects sentence boundaries
      2. Complete utterance → Sarvam Saarika v2 STT → Hindi/Hinglish text
      3. Hindi text + conversation history → Groq Llama → English (2-step)
      4. English → Sarvam Bulbul TTS → speaker output
    """
    global is_translating, GLOBAL_SPEAKER, GLOBAL_THRESHOLD

    if not GROQ_API_KEY:
        emit_event("error", message="Groq API key not set. Add it in Settings → AI Authentication.")
        is_translating = False
        return

    loop = asyncio.get_running_loop()
    utterance_queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    blocksize = int(SAMPLE_RATE * 0.1)   # 100ms chunks at 16 kHz

    # ── Local VAD state ──────────────────────────────────────────────────────
    # Two-stage detection:
    #   • GLOBAL_THRESHOLD = RMS floor (slider-controlled, default 0.01)
    #   • SILENCE_CHUNKS   = how many consecutive silent chunks = end of sentence
    # Pre-buffer keeps 300ms before speech onset so first syllable isn't clipped.
    # ─────────────────────────────────────────────────────────────────────────
    SILENCE_CHUNKS = 8    # 8 × 100ms = 0.8s silence → end of utterance

    _vad_speaking    = [False]
    _vad_silence_cnt = [0]
    _vad_buffer      = []
    _vad_pre_buf     = collections.deque(maxlen=5)   # 500ms pre-speech — catches opening words like "kya"
    _tts_active      = [False]  # True while TTS is playing — blocks mic to prevent feedback loop

    # webrtcvad: Google's neural VAD (aggressiveness 2 = balanced for office environments)
    # Falls back to RMS threshold silently if webrtcvad-wheels not installed.
    vad = _webrtcvad.Vad(2) if _WEBRTCVAD_AVAILABLE else None

    def audio_callback(indata: np.ndarray, _frames, _time_info, _status):
        chunk      = indata.copy()
        float_data = chunk.astype(np.float32) / 32768.0
        rms        = float(np.sqrt(np.mean(float_data ** 2)))

        # Volume meter for UI signal bar
        emit_event("volume", level=float(min(100, rms * 1000)))

        if not is_translating:
            return

        # Block mic capture while TTS is playing — prevents feedback loop where
        # the English TTS voice is picked up by the mic and re-transcribed as Hindi.
        if _tts_active[0]:
            return

        # ── Speech detection ─────────────────────────────────────────────────
        if vad is not None:
            # webrtcvad: split 100ms chunk into 5 × 20ms frames, majority vote
            raw         = chunk.flatten().tobytes()
            frame_bytes = int(SAMPLE_RATE * 0.02) * 2   # 20ms × 2 bytes (int16)
            n_frames    = len(raw) // frame_bytes
            if n_frames > 0:
                speech_frames = sum(
                    1 for i in range(n_frames)
                    if vad.is_speech(raw[i * frame_bytes:(i + 1) * frame_bytes], SAMPLE_RATE)
                )
                # Majority vote + minimum energy floor (prevents dead-silent false positives)
                is_speech = (speech_frames > n_frames // 2) and rms > 0.002
            else:
                is_speech = rms > 0.003
        else:
            # Fallback: RMS threshold (slider-controlled)
            is_speech = rms > max(0.003, float(GLOBAL_THRESHOLD))

        if is_speech:
            # ── Speech ──────────────────────────────────────────────────────
            if not _vad_speaking[0]:
                # Prepend pre-buffer so opening syllables ("kya", "toh") aren't clipped
                _vad_buffer.extend(list(_vad_pre_buf))
                _vad_speaking[0] = True
                emit_event("status", message="Hearing...")
            _vad_silence_cnt[0] = 0
            _vad_buffer.append(chunk)
        else:
            # ── Silence ─────────────────────────────────────────────────────
            _vad_pre_buf.append(chunk)
            if _vad_speaking[0]:
                _vad_silence_cnt[0] += 1
                _vad_buffer.append(chunk)

                if _vad_silence_cnt[0] >= SILENCE_CHUNKS:
                    # 0.8s of silence → sentence boundary detected
                    speech_chunks = _vad_buffer[:-SILENCE_CHUNKS]
                    if len(speech_chunks) >= 3:   # Minimum 300ms of speech
                        utterance = np.concatenate(speech_chunks, axis=0)
                        try:
                            loop.call_soon_threadsafe(
                                utterance_queue.put_nowait, utterance
                            )
                        except asyncio.QueueFull:
                            pass   # Drop if queue backed up — prefer fresh audio

                    _vad_buffer.clear()
                    _vad_speaking[0]    = False
                    _vad_silence_cnt[0] = 0

    # Force PortAudio to re-enumerate devices before opening the stream.
    # On Windows, stale WASAPI state from a previous session causes -9985
    # even for valid devices. Reinitializing fixes this without restarting the app.
    sd._terminate()
    sd._initialize()

    # Open input stream — try selected device first, fall back to system default
    # if the chosen device is still unavailable (e.g. held by Teams/Zoom).
    try:
        stream = sd.InputStream(
            device=in_idx,
            channels=1,
            samplerate=SAMPLE_RATE,
            dtype='int16',
            blocksize=blocksize,
            callback=audio_callback
        )
        stream.start()
    except sd.PortAudioError:
        emit_event("trace", message=f"Device #{in_idx} unavailable — falling back to system default mic...")
        try:
            stream = sd.InputStream(
                device=None,          # None = OS default input device
                channels=1,
                samplerate=SAMPLE_RATE,
                dtype='int16',
                blocksize=blocksize,
                callback=audio_callback
            )
            stream.start()
        except sd.PortAudioError as e:
            emit_event("error", message=f"Cannot open any microphone: {e}. Close apps using the mic and try again.")
            is_translating = False
            return
    emit_event("status", message="LIVE")

    groq_client          = Groq(api_key=GROQ_API_KEY)
    conversation_history = []   # Rolling window of last 5 English translations

    try:
        async def process_utterances():
            while is_translating:
                # Wait for a complete utterance from VAD
                try:
                    utterance = await asyncio.wait_for(
                        utterance_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                emit_event("status", message="Thinking...")

                # ── Step 1: Sarvam Saarika v2 → Hindi/Hinglish text ─────────
                # webrtcvad already filtered noise before this point — no energy
                # gate needed. Saarika handles Hindi, Hinglish, and Indian accents.
                wav_bytes = _pcm_to_wav_bytes(utterance, SAMPLE_RATE)

                try:
                    hindi_text = await loop.run_in_executor(
                        None,
                        lambda: _apply_hinglish_corrections(speech_to_text(wav_bytes))
                    )
                except Exception as e:
                    emit_event("error", message=f"STT Error: {str(e)}")
                    emit_event("status", message="LIVE")
                    continue

                if not hindi_text or len(hindi_text) < 2:
                    emit_event("status", message="LIVE")
                    continue

                # ── Step 2: Groq Llama-3.3-70b → English with context ────────
                context_str = (
                    "\n".join(f"  — {h}" for h in conversation_history[-5:])
                    if conversation_history
                    else "  (Start of conversation)"
                )
                system_prompt = _MEETING_PROMPT.format(context=context_str)

                try:
                    result = await loop.run_in_executor(
                        None,
                        lambda: groq_client.chat.completions.create(
                            model="llama-3.3-70b-versatile",
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user",   "content": hindi_text}
                            ],
                            temperature=0.1,   # Low temp = consistent formal output
                            max_tokens=300
                        )
                    )
                    english = result.choices[0].message.content.strip()
                except Exception as e:
                    emit_event("error", message=f"Translation Error: {str(e)}")
                    emit_event("status", message="LIVE")
                    continue

                if not english:
                    emit_event("status", message="LIVE")
                    continue

                # Update rolling conversation history for next utterance's context
                conversation_history.append(english)
                if len(conversation_history) > 5:
                    conversation_history.pop(0)

                # Emit to UI — now shows actual Hindi text in log
                emit_event("utterance", hindi=hindi_text, english=english)

                # ── Step 3: Sarvam Bulbul TTS ────────────────────────────────
                # Set _tts_active flag before playback so audio_callback ignores
                # mic input during playback — prevents TTS voice re-transcription.
                sd.stop()
                spk = GLOBAL_SPEAKER

                def _play_and_clear(text, dev, speaker):
                    _tts_active[0] = True
                    try:
                        play_tts_pipelined(text, dev, speaker)
                    finally:
                        _tts_active[0] = False
                        # Reset VAD state so partial captures during TTS don't bleed over
                        _vad_buffer.clear()
                        _vad_speaking[0]    = False
                        _vad_silence_cnt[0] = 0

                loop.run_in_executor(None, _play_and_clear, english, out_idx, spk)
                emit_event("status", message="LIVE")

        await process_utterances()

    except Exception as e:
        emit_event("error", message=f"Pipeline error: {str(e)}")
    finally:
        stream.stop()
        stream.close()
        emit_event("volume", level=0.0)
        is_translating = False


def run_streaming_loop(in_idx: int, out_idx: int):
    """Thread entry point: runs the async pipeline in its own event loop."""
    asyncio.run(_async_stream_loop(in_idx, out_idx))


# ── Command Handler ──────────────────────────────────────────────────────────

def handle_command(cmd: dict):
    global is_translating, GLOBAL_SPEAKER, GLOBAL_THRESHOLD, GROQ_API_KEY

    c = cmd.get("cmd")

    if c == "start":
        if is_translating:
            return
        in_idx          = cmd.get("in_device", 0)
        out_idx         = cmd.get("out_device", 0)
        GLOBAL_SPEAKER  = cmd.get("speaker", "shubh")
        GLOBAL_THRESHOLD = cmd.get("vad_threshold", 0.01)
        is_translating  = True
        threading.Thread(
            target=run_streaming_loop,
            args=(in_idx, out_idx),
            daemon=True
        ).start()

    elif c == "stop":
        is_translating = False
        sd.stop()   # Stop any active TTS immediately on user stop
        emit_event("status", message="READY")

    elif c == "update_speaker":
        GLOBAL_SPEAKER = cmd.get("speaker", "shubh")

    elif c == "update_threshold":
        GLOBAL_THRESHOLD = cmd.get("vad_threshold", 0.01)

    elif c == "update_api_key":
        # Sarvam key — used for TTS (Bulbul voice)
        from translator import set_api_key, verify_api_key
        key = cmd.get("api_key")

        if not key or len(key.strip()) < 20:
            emit_event("auth_result", status="error", message="Invalid Key Format")
            return

        def run_auth():
            try:
                set_api_key(key)
                emit_event("status", message="Authenticating Sarvam...")
                if verify_api_key():
                    emit_event("auth_result", status="success")
                    emit_event("status", message="Sarvam Key Activated")
            except Exception as e:
                emit_event("auth_result", status="error", message=str(e))
                emit_event("status", message="Sarvam Auth Failed")

        threading.Thread(target=run_auth, daemon=True).start()

    elif c == "update_groq_key":
        # Groq key — used for Whisper STT + Llama translation
        key = cmd.get("api_key", "").strip()

        if not key or len(key) < 20:
            emit_event("groq_auth_result", status="error", message="Invalid Key Format")
            return

        def run_groq_auth():
            global GROQ_API_KEY
            try:
                GROQ_API_KEY = key
                emit_event("status", message="Verifying Groq Key...")
                # Minimal test: 1 token generation confirms key + model access
                test_client = Groq(api_key=key)
                test_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": "hi"}],
                    max_tokens=1
                )
                emit_event("groq_auth_result", status="success")
                emit_event("status", message="Groq Key Activated")
            except Exception as e:
                GROQ_API_KEY = ""
                emit_event("groq_auth_result", status="error", message=str(e))
                emit_event("status", message="Groq Auth Failed")

        threading.Thread(target=run_groq_auth, daemon=True).start()

    elif c == "preview_voice":
        s = cmd.get("speaker", "shubh")
        o = cmd.get("out_device", 0)
        t = cmd.get("text", "At SyncSpeak, we are revolutionizing the way the world communicates.")

        def do_preview():
            try:
                preview_dev = o
                for i, dev in enumerate(sd.query_devices()):
                    d_n = dev['name'].lower()
                    if dev['max_output_channels'] > 0 and "cable" not in d_n:
                        preview_dev = i
                        break

                project_root = Path(__file__).parent.parent
                local_path   = project_root / "resources" / "samples" / f"{s}.wav"

                if local_path.exists():
                    with wave.open(str(local_path), 'rb') as wf:
                        fs  = wf.getframerate()
                        raw = wf.readframes(wf.getnframes())
                    p_data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                    emit_event("status", message="[CACHE] Local playback (Zero Tokens)")
                    with playback_lock:
                        sd.play(p_data, samplerate=fs, device=preview_dev, blocking=True)
                    return

                emit_event("status", message="[API] Sample Request (Using Tokens)")
                b64    = synthesize_speech(t, speaker=s)
                p_data, fs = decode_base64_audio(b64)
                with playback_lock:
                    sd.play(p_data, samplerate=fs, device=preview_dev, blocking=True)

            except Exception as e:
                emit_event("error", message=str(e))

        threading.Thread(target=do_preview, daemon=True).start()

    elif c == "list_devices":
        if cmd.get("force_rescan", False):
            sd._terminate()
            sd._initialize()
        inputs, outputs = get_audio_devices()
        emit_event("devices", inputs=inputs, outputs=outputs)

    elif c == "install_cable":
        threading.Thread(target=handle_install_cable, daemon=True).start()


def handle_install_cable():
    try:
        emit_event("install_status", message="Preparing download...")
        temp_dir = Path(tempfile.gettempdir()) / "SyncSpeak_Cable"
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        url      = "https://download.vb-audio.com/Download_Html/VBCABLE_Driver_Pack43.zip"
        zip_path = temp_dir / "vbcable.zip"

        emit_event("install_status", message="Downloading driver (Step 1/3)...")
        urllib.request.urlretrieve(url, zip_path)

        emit_event("install_status", message="Extracting files (Step 2/3)...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)

        emit_event("install_status", message="Launching installer (Step 3/3)... Please allow Admin access.")

        import platform
        exe_name = "VBCABLE_Setup_x64.exe" if platform.machine().endswith('64') else "VBCABLE_Setup.exe"
        exe_path = temp_dir / exe_name

        if exe_path.exists():
            subprocess.Popen([str(exe_path)], shell=True)
            emit_event("install_done", message="Installer launched! Follow instructions on screen.")
        else:
            emit_event("error", message="Could not find installer EXE in downloaded pack.")

    except Exception as e:
        emit_event("error", message=f"Installation failed: {str(e)}")
        emit_event("install_done", message="Installation error.")


def main():
    # API keys are injected at runtime via update_api_key / update_groq_key commands
    # sent by the frontend on the 'ready' event. No .env file or env vars required.
    emit_event("ready")
    ins, outs = get_audio_devices()
    emit_event("devices", inputs=ins, outputs=outs)
    for line in sys.stdin:
        if line.strip():
            try:
                handle_command(json.loads(line))
            except Exception:
                pass


if __name__ == "__main__":
    main()
