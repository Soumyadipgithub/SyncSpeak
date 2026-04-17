import os
from dotenv import load_dotenv
import requests
import base64
import io
import wave
import numpy as np
import sounddevice as sd

load_dotenv()
API_KEY = os.environ.get("SARVAM_API_KEY")

r = requests.post(
    'https://api.sarvam.ai/text-to-speech', 
    headers={'api-subscription-key': API_KEY, 'Content-Type': 'application/json'}, 
    json={
        'inputs': ['Hello, this is a test from the Sarvam AI pipeline. Can you hear me clearly?'], 
        'target_language_code': 'en-IN', 
        'speaker': 'anushka',
        'pitch': 0, 'pace': 1.05, 'loudness': 1.5, 'speech_sample_rate': 16000
    }
)

if r.status_code == 200:
    base64_string = r.json().get('audios', [])[0]
    audio_bytes = base64.b64decode(base64_string)
    
    # Save to file to verify
    with open("test_output.wav", "wb") as f:
        f.write(audio_bytes)
    
    print("Saved test_output.wav")
    
    # Try reading as wav
    try:
        with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
            sample_rate = wf.getframerate()
            raw = wf.readframes(wf.getnframes())
        audio_data = np.frombuffer(raw, dtype=np.int16)
        print(f"Decoded WAV: {sample_rate}Hz, shape {audio_data.shape}")
        
        print("Playing audio on default device...")
        sd.play(audio_data, samplerate=sample_rate, blocking=True)
        print("Finished playing.")
    except Exception as e:
        print("Failed to decode WAV:", e)
else:
    print("API Error:", r.status_code, r.text)
