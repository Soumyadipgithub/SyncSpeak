import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './VoicesPage.css'

interface Voice {
  id: string
  name: string
  gender: 'Male' | 'Female'
  style: string
  color: string
}

const voices: Voice[] = [
  { id: 'meera', name: 'Meera', gender: 'Female', style: 'Warm & Professional', color: '#f97316' },
  { id: 'pavithra', name: 'Pavithra', gender: 'Female', style: 'Clear & Calm', color: '#10d9a0' },
  { id: 'maitreyi', name: 'Maitreyi', gender: 'Female', style: 'Energetic & Friendly', color: '#ec4899' },
  { id: 'arvind', name: 'Arvind', gender: 'Male', style: 'Deep & Authoritative', color: '#6366f1' },
  { id: 'karthik', name: 'Karthik', gender: 'Male', style: 'Neutral & Smooth', color: '#0ea5e9' },
  { id: 'amol', name: 'Amol', gender: 'Male', style: 'Crisp & Modern', color: '#8b5cf6' },
  { id: 'amartya', name: 'Amartya', gender: 'Male', style: 'Confident & Bold', color: '#14b8a6' },
]

export default function VoicesPage() {
  const [selectedVoice, setSelectedVoice] = useState('meera')
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const handlePreview = (voiceId: string) => {
    setPreviewingId(voiceId)
    invoke('send_sidecar_command', { 
      cmd: JSON.stringify({ cmd: 'preview_voice', speaker: voiceId, out_device: 0 }) 
    })
    setTimeout(() => setPreviewingId(null), 3000)
  }

  const handleSelect = (voiceId: string) => {
    setSelectedVoice(voiceId)
    // The actual sidecar uses speaker_id from the start command, 
    // but we can send a dedicated command if needed.
  }

  return (
    <div className="voices-page">
      <div className="voices-header">
        <h2>AI Voices</h2>
        <p className="voices-sub">Choose a voice for your English translations</p>
      </div>

      <div className="voices-grid">
        {voices.map(voice => (
          <div
            key={voice.id}
            className={`voice-card glass-card ${selectedVoice === voice.id ? 'selected' : ''}`}
            onClick={() => handleSelect(voice.id)}
            style={{ '--accent': voice.color } as React.CSSProperties}
          >
            <div className="voice-avatar" style={{ background: `linear-gradient(135deg, ${voice.color}, ${voice.color}88)` }}>
              {voice.name[0]}
            </div>
            <div className="voice-info">
              <div className="voice-name">{voice.name}</div>
              <div className="voice-meta">
                <span className="voice-gender">{voice.gender}</span>
                <span className="voice-style">{voice.style}</span>
              </div>
            </div>
            <button
              className="preview-btn"
              onClick={(e) => { e.stopPropagation(); handlePreview(voice.id) }}
              disabled={previewingId === voice.id}
            >
              {previewingId === voice.id ? (
                <span className="preview-playing">Playing...</span>
              ) : (
                '▶ Preview'
              )}
            </button>
            {selectedVoice === voice.id && <div className="selected-badge">Active</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
