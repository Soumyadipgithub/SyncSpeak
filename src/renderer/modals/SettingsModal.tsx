import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-shell'
import { useAppStore } from '../store/appStore'
import { APP_NAME, APP_VERSION, GITHUB_URL } from '../constants'
import './SettingsModal.css'

interface SettingsModalProps {
  onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [autoStart, setAutoStart] = useState(false)
  const [showNotifications, setShowNotifications] = useState(true)
  const [outputVolume, setOutputVolume] = useState(80)
  const [apiKey, setApiKey] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [groqKey, setGroqKey] = useState('')
  const [isVerifyingGroq, setIsVerifyingGroq] = useState(false)
  const [groqAuthError, setGroqAuthError] = useState<string | null>(null)
  const { apiKeyValid, setApiKeyValid, groqKeyValid, setGroqKeyValid } = useAppStore()

  useEffect(() => {
    const loadConfig = async () => {
      const savedKey = await invoke<string | null>('get_config', { key: 'sarvam_api_key' })
      if (savedKey) setApiKey(savedKey)
      const savedGroqKey = await invoke<string | null>('get_config', { key: 'groq_api_key' })
      if (savedGroqKey) setGroqKey(savedGroqKey)
    }
    loadConfig()

    const setupListeners = async () => {
      const unlisten = await listen('sidecar-event', (event) => {
        const data = event.payload as { event: string; [key: string]: any }
        if (data.event === 'auth_result') {
          setIsVerifying(false)
          if (data.status === 'success') {
            setAuthError(null)
          } else {
            setAuthError(data.message || 'Invalid API Key')
          }
        }
        if (data.event === 'groq_auth_result') {
          setIsVerifyingGroq(false)
          if (data.status === 'success') {
            setGroqKeyValid(true)
            setGroqAuthError(null)
          } else {
            setGroqKeyValid(false)
            setGroqAuthError(data.message || 'Invalid Groq Key')
          }
        }
      })
      return unlisten
    }
    
    const unlistenPromise = setupListeners()
    return () => { unlistenPromise.then(u => u()) }
  }, [])

  const handleSaveGroqKey = async () => {
    const trimmed = groqKey.trim()
    setGroqKeyValid(false)  // reset global store
    setGroqAuthError(null)
    await invoke('save_config', { key: 'groq_api_key', value: trimmed })
    invoke('send_sidecar_command', {
      cmd: JSON.stringify({ cmd: 'update_groq_key', api_key: trimmed })
    })
    if (!trimmed) { setGroqAuthError('Key cleared'); return }
    if (trimmed.length < 20) { setGroqAuthError('Too short (min 20 characters)'); return }
    setIsVerifyingGroq(true)
  }

  const handleSaveApiKey = async () => {
    const trimmed = apiKey.trim()
    
    // 1. Reset Global UI State
    setApiKeyValid(false)
    setAuthError(null)

    // 2. ALWAYS save to hard drive immediately (to stop "remembering" old one)
    await invoke('save_config', { key: 'sarvam_api_key', value: trimmed })
    
    // 3. Update active engine memory
    invoke('send_sidecar_command', { 
      cmd: JSON.stringify({ cmd: 'update_api_key', api_key: trimmed }) 
    })

    // 4. Local format validation feedback
    if (!trimmed) {
      setAuthError('Key cleared')
      return
    }
    if (trimmed.length < 20) {
      setAuthError('Too short (min 20 characters)')
      return
    }

    // 5. If layout is okay, show verifying state
    setIsVerifying(true)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* API Configuration */}
          <div className="settings-section">
            <h3 className="section-title">AI Authentication</h3>
            <p className="setting-description">Groq powers Translation. Sarvam powers STT (speech recognition) and TTS (Indian voice).</p>

            {/* Groq API Key */}
            <div className="setting-item">
              <div className="setting-label">
                <span>Groq API Key <span style={{fontSize:'0.75em', opacity:0.6}}>(Translation — Free)</span></span>
                {groqKeyValid ? (
                  <span className="save-status active">✔ Active</span>
                ) : (
                  groqAuthError && <span className="save-status error">⚠ Failed</span>
                )}
              </div>
              <div className="api-input-wrapper">
                <input
                  type="password"
                  value={groqKey}
                  onChange={e => { setGroqKey(e.target.value); setGroqKeyValid(false); setGroqAuthError(null) }}  // reset on edit
                  placeholder="gsk_..."
                  className={`settings-input ${groqAuthError ? 'input-error' : ''}`}
                />
                <button
                  className={`settings-save-btn ${groqKeyValid ? 'saved' : ''} ${isVerifyingGroq ? 'verifying' : ''}`}
                  onClick={handleSaveGroqKey}
                  disabled={isVerifyingGroq}
                >
                  {isVerifyingGroq ? 'Verifying...' : 'Activate'}
                </button>
              </div>
              {groqAuthError && <p className="setting-error-msg">{groqAuthError}</p>}
              <p className="setting-hint">Free forever. Get from <a href="#" onClick={(e) => { e.preventDefault(); open('https://console.groq.com/keys'); }}>console.groq.com</a>.</p>
            </div>

            {/* Sarvam API Key */}
            <div className="setting-item">
              <div className="setting-label">
                <span>Sarvam API Key <span style={{fontSize:'0.75em', opacity:0.6}}>(Indian Voice TTS)</span></span>
                {apiKeyValid ? (
                  <span className="save-status active">✔ Active</span>
                ) : (
                  authError && <span className="save-status error">⚠ Failed</span>
                )}
              </div>
              <div className="api-input-wrapper">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value)
                    setApiKeyValid(false)
                    setAuthError(null)
                  }}
                  placeholder="Paste your api_key here..."
                  className={`settings-input ${authError ? 'input-error' : ''}`}
                />
                <button
                  className={`settings-save-btn ${apiKeyValid ? 'saved' : ''} ${isVerifying ? 'verifying' : ''}`}
                  onClick={handleSaveApiKey}
                  disabled={isVerifying}
                >
                  {isVerifying ? 'Verifying...' : 'Activate'}
                </button>
              </div>
              {authError && <p className="setting-error-msg">{authError}</p>}
              <p className="setting-hint">Get this from the <a href="#" onClick={(e) => { e.preventDefault(); open('https://dashboard.sarvam.ai/'); }}>Sarvam Dashboard</a>.</p>
            </div>
          </div>

          {/* Audio Settings */}
          {/* Audio Settings (Simplified for Perfect Experience) */}
          <div className="settings-section">
            <h3 className="section-title">Audio</h3>
            <p className="setting-description">Voice intelligence is automatically optimized for low-latency meetings.</p>

            <div className="setting-item">
              <div className="setting-label">
                <span>AI Output Volume</span>
                <span className="setting-value">{outputVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={outputVolume}
                onChange={e => setOutputVolume(Number(e.target.value))}
                className="setting-slider"
                style={{ '--progress': `${outputVolume}%` } as React.CSSProperties}
              />
              <p className="setting-hint">Adjust the loudness of the translated voice.</p>
            </div>
          </div>

          {/* General Settings */}
          <div className="settings-section">
            <h3 className="section-title">General</h3>

            <div className="setting-toggle">
              <div>
                <span className="toggle-label">Auto-start translation</span>
                <p className="setting-hint">Begin translating when app opens</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={e => setAutoStart(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>

            <div className="setting-toggle">
              <div>
                <span className="toggle-label">Desktop Notifications</span>
                <p className="setting-hint">Show alerts for errors and status changes</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showNotifications}
                  onChange={e => setShowNotifications(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>
          </div>

          {/* About */}
          <div className="settings-section">
            <h3 className="section-title">About</h3>
            <div className="about-info">
              <span>{APP_NAME} v{APP_VERSION}</span>
              <a
                className="github-star-btn"
                href="#"
                onClick={e => { e.preventDefault(); open(GITHUB_URL) }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                Give us a star 🌟
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
