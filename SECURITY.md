# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email the maintainer directly at the address listed on the [GitHub profile](https://github.com/Soumyadipgithub). Include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within 7 days. If the issue is confirmed, a fix will be released as soon as practical and you will be credited in the release notes (unless you prefer to remain anonymous).

---

## Security model

SyncSpeak is a local desktop application. Its threat model is:

- **API keys** are stored in plaintext JSON at `%APPDATA%\com.syncspeak.app\config.json`. This location is user-profile-scoped and protected by Windows ACLs. Keys are never transmitted except to their respective APIs (Sarvam AI, Groq) over HTTPS.
- **Audio data** is processed locally by the Python sidecar and sent to Sarvam AI's REST API over HTTPS. No audio is stored on disk.
- **Translation history** is stored locally in `%APPDATA%\com.syncspeak.app\history.jsonl`. It never leaves the device.
- **No network server** is exposed. The app has no listening ports.
- **The Python sidecar** communicates with the Tauri shell via stdin/stdout only — no sockets, no pipes accessible from outside the process.

## Known limitations

- API keys are stored in plaintext. Encrypting them with the Windows DPAPI or system keyring is a known improvement not yet implemented.
- CSP is currently `null` in `tauri.conf.json`. This is acceptable for a local-only app but would need tightening if remote content were ever loaded.
