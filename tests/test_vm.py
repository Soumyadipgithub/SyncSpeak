import os
from dotenv import load_dotenv
import requests
import base64
import io
import wave
import time
import numpy as np
import sounddevice as sd

load_dotenv()
API_KEY = os.environ.get("SARVAM_API_KEY")

r = requests.post(
    'https://api.sarvam.ai/text-to-speech', 
    headers={'api-subscription-key': API_KEY, 'Content-Type': 'application/json'}, 
    json={
        'inputs': ['Testing the audio pipeline.'], 
        'target_language_code': 'en-IN', 
        'speaker': 'anushka',
        'pitch': 0, 'pace': 1.05, 'loudness': 1.5, 'speech_sample_rate': 16000
    }
)

base64_string = r.json().get('audios', [])[0]
audio_bytes = base64.b64decode(base64_string)
with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
    sample_rate = wf.getframerate()
    raw = wf.readframes(wf.getnframes())
audio_data = np.frombuffer(raw, dtype=np.int16)

devices = sd.query_devices()
vm_idx = -1
for i, dev in enumerate(devices):
    if "Voicemeeter Input" in dev["name"]:
        vm_idx = i
        break

print(f"Testing on VoiceMeeter Input ID: {vm_idx}")
if vm_idx != -1:
    print("Playing raw int16...")
    sd.play(audio_data, samplerate=sample_rate, device=vm_idx, blocking=True)
    time.sleep(1)
    
    print("Playing normalized float32...")
    float_data = audio_data.astype('float32') / 32768.0
    sd.play(float_data, samplerate=sample_rate, device=vm_idx, blocking=True)
    print("Done")
