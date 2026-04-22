import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../store/appStore'
import { APP_NAME } from '../constants'
import './GuidePage.css'

export default function GuidePage() {
  const [cableFound, setCableFound] = useState<boolean | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const { apiKeyValid, setApiKeyValid, setShowSettings } = useAppStore()

  useEffect(() => {
    const setupListeners = async () => {
      const unlisten = await listen('sidecar-event', (event) => {
        const data = event.payload as { event: string; [key: string]: any }
        
        if (data.event === 'devices') {
          const outputs = (data.outputs as any[]) || []
          const found = outputs.some(d => d.name.toLowerCase().includes('cable'))
          setCableFound(found)
        } else if (data.event === 'install_status' || data.event === 'install_done') {
          setInstallMessage(data.message)
          if (data.event === 'install_done') {
            setTimeout(() => setInstallMessage(null), 5000)
            if (data.message === "Active") {
              setShowSuccessPopup(true)
            }
            invoke('send_sidecar_command', { cmd: JSON.stringify({ cmd: 'list_devices', force_rescan: true }) })
          }
        }
      })
      
      invoke('send_sidecar_command', { cmd: JSON.stringify({ cmd: 'list_devices' }) })
      return unlisten
    }
    const unlistenPromise = setupListeners()
    return () => {
      unlistenPromise.then(u => u())
    }
  }, [])

  const handleInstallCable = () => {
    setInstallMessage('Starting installation...')
    invoke('send_sidecar_command', { cmd: JSON.stringify({ cmd: 'install_cable' }) })
  }

  return (
    <div className="guide-page">
      <div className="guide-hero">
        <svg viewBox="0 0 800 60" className="liquid-glass-header">
          <defs>
            <filter id="liquid-glass-effect" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
              <feSpecularLighting in="blur" surfaceScale="5" specularConstant="2.8" specularExponent="55" lightingColor="#ffffff" result="spec">
                <fePointLight x="-120" y="-120" z="400" />
              </feSpecularLighting>
              <feComposite in="spec" in2="SourceAlpha" operator="in" result="glint" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="glint" />
              </feMerge>
            </filter>
            
            <linearGradient id="rainbow-gradient" x1="0%" y1="0%" x2="400%" y2="0%" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff0000" />
              <stop offset="14.2%" stopColor="#ff7f00" />
              <stop offset="28.4%" stopColor="#ffff00" />
              <stop offset="42.6%" stopColor="#00ff00" />
              <stop offset="56.8%" stopColor="#0000ff" />
              <stop offset="71.0%" stopColor="#4b0082" />
              <stop offset="85.2%" stopColor="#8b00ff" />
              <stop offset="100%" stopColor="#ff0000" />
              <animate attributeName="x1" from="0%" to="-300%" dur="8s" repeatCount="indefinite" />
              <animate attributeName="x2" from="400%" to="100%" dur="8s" repeatCount="indefinite" />
            </linearGradient>
          </defs>
          <text 
            x="50%" 
            y="38" 
            textAnchor="middle" 
            className="liquid-text"
            filter="url(#liquid-glass-effect)"
            style={{ fill: 'url(#rainbow-gradient)' }}
          >
            Meeting Setup Guide
          </text>
        </svg>
        <p>Follow these steps to ensure {APP_NAME} works perfectly with your meetings.</p>
      </div>

      <div className="setup-grid">
        {/* Step 0: API Key */}
        <div className={`setup-step ${!apiKeyValid ? 'status-error' : 'status-success'}`}>
          <div className="step-number">00</div>
          <div className="step-content">
            <h3>Authentication</h3>
            <h2>Sarvam AI Key</h2>
            
            {!apiKeyValid ? (
              <div className="install-container">
                <p>To start translating, you need to connect your Sarvam account. We've dedicated a central place for this in Settings.</p>
                <button 
                  className="install-btn glass-premium" 
                  onClick={() => setShowSettings(true)}
                >
                  Configure API Key
                </button>
              </div>
            ) : (
              <div className="step-done-card">
                <div className="done-icon">✔</div>
                <div className="done-text">
                  <p>Your Sarvam AI engine is active and ready for your first meeting.</p>
                </div>
                <button className="change-btn" onClick={() => setShowSettings(true)}>Change in Settings</button>
              </div>
            )}
          </div>
          {!apiKeyValid && <div className="status-badge error">Auth Required</div>}
          {apiKeyValid && <div className="status-badge success">Verified</div>}
        </div>

        {/* Step 1: VB-Cable */}
        <div className={`setup-step ${cableFound === false ? 'status-error' : cableFound === true ? 'status-success' : ''}`}>
          <div className="step-number">01</div>
          <div className="step-content">
            <h3>Infrastructure</h3>
            <h2>Virtual Audio Driver</h2>
            <p>{APP_NAME} uses a virtual cable to route your translated English voice from the AI engine directly into your meeting software.</p>
            
            {cableFound === true ? (
              <div className="step-done-card">
                <div className="done-icon">✓</div>
                <div className="done-text">
                  <p>Driver active and verified.</p>
                </div>
              </div>
            ) : cableFound === false ? (
              <div className="install-container">
                <p className="install-note">One-click installation for professional audio routing.</p>
                <button className="install-btn glass-premium" onClick={handleInstallCable} disabled={!!installMessage}>
                  {installMessage ? 'Initializing...' : 'Install Driver'}
                </button>
              </div>
            ) : (
              <div className="status-label checking">Checking hardware...</div>
            )}
          </div>
          {cableFound === false && <div className="status-badge error">Missing Pipeline</div>}
          {cableFound === true && <div className="status-badge success">Active</div>}
        </div>

        {/* Step 2: Meeting App Setup */}
        <div className="setup-step glass-card">
          <div className="step-number">02</div>
          <div className="step-content">
            <h3>Configuration</h3>
            <h2>Meeting Software</h2>
            <p>Open Zoom, Meet, or Teams. This is the most <strong>critical</strong> step to ensure others hear your translation.</p>
            
            <div className="config-box">
              <div className="config-item">
                <span className="label">Microphone</span>
                <span className="value-highlight">CABLE Output (VB-Audio)</span>
              </div>
              <div className="config-item">
                <span className="label">Speaker</span>
                <span className="value">Your Usual Headphones</span>
              </div>
            </div>
            
            <p className="config-note">
              {APP_NAME} "speaks" into the virtual cable; your meeting "listens" to it.
            </p>
          </div>
        </div>

        {/* Step 3: Speak and Sync */}
        <div className="setup-step glass-card">
          <div className="step-number">03</div>
          <div className="step-content">
            <h3>Operation</h3>
            <h2>Start Translating</h2>
            <p>Go to the <strong>Translate</strong> tab, choose your physical microphone, and hit Start.</p>
            <p style={{ marginTop: 'var(--space-s)' }}>{APP_NAME} will capture your Hindi voice and play the English version through the cable.</p>
            <p className="status-label success" style={{ background: 'transparent', border: 'none', padding: '0', marginTop: 'auto' }}>
               Ready for Live Action
            </p>
          </div>
        </div>
      </div>

      {installMessage && (
        <div className="install-status-overlay">
          <div className="status-bubble glass-card">
            <div className="spinner" />
            {installMessage}
          </div>
        </div>
      )}

      {/* SUCCESS POPUP OVERLAY */}
      {showSuccessPopup && (
        <div className="premium-popup-overlay">
          <div className="premium-popup-content glass-card">
            <div className="popup-icon">✨</div>
            <h2>Installation Successful!</h2>
            <p>Your Virtual Audio Driver is ready. We need to refresh the audio engine to activate your new pipeline.</p>
            <div className="popup-actions">
              <button className="popup-btn primary" onClick={async () => {
                await invoke('restart_sidecar')
                setShowSuccessPopup(false)
              }}>
                Refresh Engine Now
              </button>
              <button className="popup-btn secondary" onClick={() => setShowSuccessPopup(false)}>
                I'll do it later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
