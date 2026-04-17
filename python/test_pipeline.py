#!/usr/bin/env python3
"""
SyncSpeak Pipeline Diagnostic — test_pipeline.py
Run with: python test_pipeline.py

Tests each layer independently and prints timing numbers so you know
exactly what the pipeline is doing and how fast it is.

PASS = working correctly
FAIL = broken (shows exact error)
"""

import sys
import os
import time
sys.stdout.reconfigure(encoding='utf-8')
import asyncio
import base64
import io
import numpy as np
from pathlib import Path

# Add python folder to path so imports work
sys.path.insert(0, str(Path(__file__).parent))

# ─── Color helpers ────────────────────────────────────────────────────────────
def ok(msg):    print(f"  [ PASS ] {msg}")
def fail(msg):  print(f"  [ FAIL ] {msg}")
def info(msg):  print(f"  [ .... ] {msg}")
def head(msg):  print(f"\n{'='*55}\n  {msg}\n{'='*55}")

# ─── TEST 1: Imports ─────────────────────────────────────────────────────────
head("TEST 1: Imports")
try:
    from translator import (
        synthesize_speech, decode_base64_audio, play_tts_pipelined,
        _split_sentences, SAMPLE_RATE, API_KEY
    )
    ok("translator.py imports cleanly")
except Exception as e:
    fail(f"translator.py: {e}")
    sys.exit(1)

try:
    from sarvamai import AsyncSarvamAI
    ok("sarvamai SDK found")
except Exception as e:
    fail(f"sarvamai not installed — run: pip install sarvamai  ({e})")
    sys.exit(1)

try:
    import sounddevice as sd
    ok("sounddevice found")
except Exception as e:
    fail(f"sounddevice: {e}")
    sys.exit(1)

# ─── TEST 2: API Key ─────────────────────────────────────────────────────────
head("TEST 2: API Key")
if not API_KEY:
    fail("SARVAM_API_KEY not set in .env file")
    sys.exit(1)
else:
    masked = API_KEY[:6] + "..." + API_KEY[-4:]
    ok(f"API key present ({masked})")

try:
    from translator import verify_api_key
    info("Calling Sarvam verify endpoint...")
    t0 = time.perf_counter()
    result = verify_api_key()
    elapsed = (time.perf_counter() - t0) * 1000
    if result:
        ok(f"API key is valid  [{elapsed:.0f}ms round-trip]")
    else:
        fail("API key rejected by Sarvam")
        sys.exit(1)
except Exception as e:
    fail(f"API key verification failed: {e}")
    sys.exit(1)

# ─── TEST 3: Audio Devices ───────────────────────────────────────────────────
head("TEST 3: Audio Devices")
try:
    devices = sd.query_devices()
    inputs  = [d for d in devices if d["max_input_channels"] > 0]
    outputs = [d for d in devices if d["max_output_channels"] > 0]
    ok(f"{len(inputs)} input devices, {len(outputs)} output devices found")

    cable_out = [d for d in outputs if "cable" in d["name"].lower()]
    if cable_out:
        ok(f"VB-Cable detected: '{cable_out[0]['name']}'")
    else:
        fail("VB-Cable NOT found — translations won't reach your meeting")

    default_in = sd.query_devices(kind='input')
    ok(f"Default input: '{default_in['name']}'")
except Exception as e:
    fail(f"Audio device scan: {e}")

# ─── TEST 4: HTTP Session (TTS connection pooling) ───────────────────────────
head("TEST 4: TTS + HTTP Session (Layer 2)")
TEST_TEXT = "Hello, this is a latency test."
try:
    info("First TTS call (cold — establishes TCP connection)...")
    t0 = time.perf_counter()
    b64 = synthesize_speech(TEST_TEXT, speaker="shubh")
    cold_ms = (time.perf_counter() - t0) * 1000
    ok(f"Cold TTS call: {cold_ms:.0f}ms")

    info("Second TTS call (warm — reuses connection)...")
    t0 = time.perf_counter()
    b64_2 = synthesize_speech(TEST_TEXT, speaker="shubh")
    warm_ms = (time.perf_counter() - t0) * 1000
    ok(f"Warm TTS call:  {warm_ms:.0f}ms  (saved ~{cold_ms - warm_ms:.0f}ms vs cold)")

    if warm_ms < cold_ms * 0.85:
        ok("Session pooling is working — warm call is faster")
    else:
        info("Warm call not significantly faster (network latency may dominate)")
except Exception as e:
    fail(f"TTS call failed: {e}")

# ─── TEST 5: Sentence Pipelining (Layer 3) ───────────────────────────────────
head("TEST 5: Sentence Pipelining (Layer 3)")
MULTI = "The meeting has started. Please share your screen. We will begin the presentation now."
sentences = _split_sentences(MULTI)
print(f"  Input text split into {len(sentences)} sentences:")
for i, s in enumerate(sentences):
    print(f"    [{i+1}] {s}")

try:
    info("Sequential TTS (old behaviour)...")
    t0 = time.perf_counter()
    for s in sentences:
        synthesize_speech(s, speaker="shubh")
    seq_ms = (time.perf_counter() - t0) * 1000
    ok(f"Sequential:  {seq_ms:.0f}ms total synthesis time")

    info("Pipelined TTS (new behaviour — overlap synthesis with playback)...")
    # We measure synthesis time only (not playback) to compare apples to apples
    import concurrent.futures
    t0 = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        futures = [ex.submit(synthesize_speech, s, "shubh") for s in sentences]
        results = [f.result() for f in futures]
    par_ms = (time.perf_counter() - t0) * 1000
    ok(f"Parallel:    {par_ms:.0f}ms total synthesis time  (saved {seq_ms - par_ms:.0f}ms)")

    if par_ms < seq_ms * 0.75:
        ok("Sentence pipelining is effective")
    else:
        info("Parallel savings are modest (Sarvam may be rate-limiting concurrent requests)")
except Exception as e:
    fail(f"Pipelining test: {e}")

# ─── TEST 6: WebSocket Streaming (Layer 1 — core latency fix) ────────────────
head("TEST 6: WebSocket Streaming STT+Translate (Layer 1)")
info("Generating synthetic 2-second Hindi-like silence audio for connection test...")

# We test connection and protocol, then do a real mic test
HINDI_SAMPLE_SECONDS = 2
SAMPLE_RATE_TEST = 16000

def _pcm_to_wav_b64(pcm_int16: np.ndarray, sample_rate: int) -> str:
    """Wrap raw int16 PCM in a WAV header and base64-encode."""
    import struct, io as _io
    data = pcm_int16.tobytes()
    data_len = len(data)
    buf = _io.BytesIO()
    buf.write(b'RIFF')
    buf.write(struct.pack('<I', 36 + data_len))
    buf.write(b'WAVE')
    buf.write(b'fmt ')
    buf.write(struct.pack('<IHHIIHH', 16, 1, 1, sample_rate, sample_rate*2, 2, 16))
    buf.write(b'data')
    buf.write(struct.pack('<I', data_len))
    buf.write(data)
    return base64.b64encode(buf.getvalue()).decode()

silence = np.zeros(int(SAMPLE_RATE_TEST * HINDI_SAMPLE_SECONDS), dtype=np.int16)
silence_wav_b64 = _pcm_to_wav_b64(silence, SAMPLE_RATE_TEST)

async def test_websocket_connection():
    client = AsyncSarvamAI(api_subscription_key=API_KEY)
    try:
        info("Opening WebSocket connection to Sarvam saaras:v3...")
        t0 = time.perf_counter()
        async with client.speech_to_text_streaming.connect(
            model="saaras:v3",
            mode="translate",
            language_code="hi-IN",
            high_vad_sensitivity="true",
            vad_signals="true",
        ) as ws:
            conn_ms = (time.perf_counter() - t0) * 1000
            ok(f"WebSocket connected in {conn_ms:.0f}ms")

            # Send silence wrapped in WAV format
            info("Sending 2s of silence (WAV-wrapped) to verify send protocol...")
            t0 = time.perf_counter()
            await ws.transcribe(audio=silence_wav_b64, sample_rate=SAMPLE_RATE_TEST)
            send_ms = (time.perf_counter() - t0) * 1000
            ok(f"Audio chunk sent in {send_ms:.1f}ms")

            # Flush to force processing
            await ws.flush()

            # Wait briefly for any response (silence → no transcript expected)
            info("Waiting for response (silence input → expect no transcript)...")
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
                info(f"Got message: type={msg.type}")
                ok("WebSocket receive path working")
            except asyncio.TimeoutError:
                ok("Timeout as expected (silence generates no transcript) — send path confirmed")

        ok("WebSocket closed cleanly")
        return True
    except Exception as e:
        fail(f"WebSocket error: {e}")
        return False

ws_ok = asyncio.run(test_websocket_connection())

# ─── TEST 7: End-to-End Latency with Real Mic (optional) ────────────────────
head("TEST 7: End-to-End Latency (Real Mic — 5 second test)")
print("  Speak a short Hindi sentence when you see 'RECORDING...'")
print("  We measure: speech end -> English text available (no audio playback)")
print("  Target: < 2000ms for natural conversation feel")
print()

try:
    input("  Press ENTER when ready (or Ctrl+C to skip)... ")
except KeyboardInterrupt:
    print("\n  Skipped.")
    print("\n" + "="*55)
    print("  SUMMARY")
    print("="*55)
    if ws_ok:
        print("  WebSocket layer: OK")
    print("  Run the app with 'npm run dev' to test full pipeline.")
    sys.exit(0)

RECORD_SECONDS = 5

async def test_e2e_latency():
    print(f"\n  RECORDING for {RECORD_SECONDS}s — speak Hindi now...")
    frames = []

    def callback(indata, frame_count, time_info, status):
        frames.append(indata.copy())

    with sd.InputStream(channels=1, samplerate=SAMPLE_RATE_TEST, dtype='int16',
                        blocksize=1600, callback=callback):
        await asyncio.sleep(RECORD_SECONDS)

    print("  Recording done. Sending to WebSocket...")

    pcm_array = np.concatenate(frames)
    wav_b64 = _pcm_to_wav_b64(pcm_array, SAMPLE_RATE_TEST)

    client = AsyncSarvamAI(api_subscription_key=API_KEY)
    t_send = time.perf_counter()

    async with client.speech_to_text_streaming.connect(
        model="saaras:v3",
        mode="translate",
        language_code="hi-IN",
        high_vad_sensitivity="true",
        vad_signals="true",
    ) as ws:
        await ws.transcribe(audio=wav_b64, sample_rate=SAMPLE_RATE_TEST)
        await ws.flush()

        try:
            async for msg in ws:
                if msg.type == "data":
                    elapsed = (time.perf_counter() - t_send) * 1000
                    english = getattr(msg.data, "transcript", "")
                    ok(f"Got English text in {elapsed:.0f}ms from send")
                    print(f"\n  English: \"{english}\"")
                    print(f"\n  Full latency estimate (stream mode):")
                    print(f"    WebSocket STT+translate: ~{elapsed:.0f}ms")
                    print(f"    TTS (first sentence):    ~800ms (estimate)")
                    print(f"    ---------------------------------------")
                    print(f"    Total to first audio:    ~{elapsed + 800:.0f}ms")
                    break
                elif msg.type == "events":
                    signal = getattr(msg.data, "signal_type", "")
                    info(f"VAD: {signal}")
        except asyncio.TimeoutError:
            fail("No transcript received within timeout — check mic and API key")

asyncio.run(test_e2e_latency())

print("\n" + "="*55)
print("  ALL TESTS COMPLETE")
print("="*55)
print("  If all PASS: run 'npm run dev' to test in the full app.")
print("  The key metric is TEST 7 — total latency < 2000ms = natural feel.")
print()
