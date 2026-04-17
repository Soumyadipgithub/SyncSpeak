import os
from dotenv import load_dotenv
import requests

load_dotenv()
API_KEY = os.environ.get("SARVAM_API_KEY")

print("Key Loaded:", bool(API_KEY))

r = requests.post(
    'https://api.sarvam.ai/translate', 
    headers={'api-subscription-key': API_KEY, 'Content-Type': 'application/json'}, 
    json={
        'input': 'नमस्ते', 
        'source_language_code': 'hi-IN', 
        'target_language_code': 'en-IN',
        'speaker_gender': 'Male', 
        'mode': 'formal'
    }
)

print(r.status_code, r.text)

r = requests.post(
    'https://api.sarvam.ai/text-to-speech', 
    headers={'api-subscription-key': API_KEY, 'Content-Type': 'application/json'}, 
    json={
        'inputs': ['Hello'], 
        'target_language_code': 'en-IN', 
        'speaker': 'meera',
        'pitch': 0, 'pace': 1.05, 'loudness': 1.5, 'speech_sample_rate': 16000
    }
)
print(r.status_code, r.text[:100])
