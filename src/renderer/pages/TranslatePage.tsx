import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LiquidTerminal } from '../components/LiquidTerminal'
import './TranslatePage.css'

interface LogEntry {
  id: string;
  type: 'heard' | 'translated' | 'system' | 'speaker';
  content: string;
  timestamp: string;
  subtext?: string;
}

interface AudioDevice {
  id: number
  name: string
}

/* --- THE LIQUID GLASS MIC ICON --- */
const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" className="glass-icon-svg">
    <defs>
      <filter id="icon-glass-glint" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="blur" />
        <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1.5" specularExponent="40" lightingColor="#ffffff" result="spec">
          <fePointLight x="-10" y="-10" z="50" />
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" />
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="rgba(255,255,255,0.7)" filter="url(#icon-glass-glint)" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5V23M8 23h8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" className="glass-icon-svg">
    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="rgba(255,255,255,0.7)" filter="url(#icon-glass-glint)" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

/* --- CUSTOM LIQUID GLASS DROPDOWN --- */
interface GlassSelectProps {
  value: any;
  options: { id: any; name: string }[];
  onChange: (value: any) => void;
}

const GlassSelect = ({ value, options, onChange }: GlassSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.id === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="glass-select-container" ref={containerRef}>
      <button className={`glass-select-trigger ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span className="select-val">{selectedOption?.name}</span>
        <span className="select-arrow">▾</span>
      </button>
      {isOpen && (
        <div className="glass-select-dropdown">
          {options.map((opt) => (
            <div key={opt.id} className={`glass-select-option ${opt.id === value ? 'selected' : ''}`} onClick={() => { onChange(opt.id); setIsOpen(false); }}>
              {opt.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function TranslatePage() {
  const [isTranslating, setIsTranslating] = useState(false)
  const [inputDevice, setInputDevice] = useState<number>(0)
  const [outputDevice, setOutputDevice] = useState<number>(0)
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([{ id: -1, name: 'Scanning...' }])
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([{ id: -1, name: 'Scanning...' }])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [vadLevel, setVadLevel] = useState(65)
  const [currentVolume, setCurrentVolume] = useState(0)
  const [selectedSpeaker, setSelectedSpeaker] = useState('shubh')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sidecarStatus, setSidecarStatus] = useState('READY')
  const sessionRef = useRef<string | null>(null)

  const addLog = (type: LogEntry['type'], content: string, subtext?: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-99), {
      id: `${Date.now()}-${Math.random()}`,
      type,
      content,
      subtext,
      timestamp: time
    }]);
  }


  useEffect(() => {
    let isMounted = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let unlistenFn: (() => void) | null = null

    const requestDevices = async (attempt = 0, forceRescan = false): Promise<void> => {
      if (!isMounted) return
      try {
        await invoke('send_sidecar_command', {
          cmd: JSON.stringify({ cmd: 'list_devices', force_rescan: forceRescan })
        })
      } catch {
        if (!isMounted) return
        if (attempt < 3) {
          retryTimer = setTimeout(() => requestDevices(attempt + 1, forceRescan), 1200 * (attempt + 1))
        } else {
          setInputDevices([{ id: -1, name: 'Engine offline — click ↻' }])
          setOutputDevices([{ id: -1, name: 'Engine offline — click ↻' }])
          addLog('system', '[CRITICAL] Audio engine unreachable. Click ↻ to retry.')
        }
      }
    }

    let unlistenError: (() => void) | null = null
    let unlistenTerminated: (() => void) | null = null

    const setupListeners = async () => {
      unlistenFn = await listen('sidecar-event', (event) => {
        if (!isMounted) return
        const data = event.payload as { event: string; [key: string]: any }

        if (data.event === 'ready') {
          // Auto-inject API keys saved from previous session
          invoke<string | null>('get_config', { key: 'sarvam_api_key' }).then(key => {
            if (key) invoke('send_sidecar_command', { cmd: JSON.stringify({ cmd: 'update_api_key', api_key: key }) })
          })
          invoke<string | null>('get_config', { key: 'groq_api_key' }).then(key => {
            if (key) invoke('send_sidecar_command', { cmd: JSON.stringify({ cmd: 'update_groq_key', api_key: key }) })
          })
        } else if (data.event === 'devices') {
          const inputs: AudioDevice[] = data.inputs || []
          const outputs: AudioDevice[] = data.outputs || []
          if (inputs.length === 0 && outputs.length === 0) {
            setInputDevices([{ id: -1, name: 'No devices found' }])
            setOutputDevices([{ id: -1, name: 'No devices found' }])
          } else {
            setInputDevices(inputs)
            setOutputDevices(outputs)
            setInputDevice(prev => prev === 0 && inputs.length > 0 ? inputs[0].id : prev)
            setOutputDevice(prev => prev === 0 && outputs.length > 0 ? outputs[0].id : prev)
          }
        } else if (data.event === 'volume') {
          setCurrentVolume(data.level)
        } else if (data.event === 'status') {
          const msg: string = data.message
          setSidecarStatus(msg.toUpperCase())
          if (msg.startsWith('[MIC]') || msg.startsWith('Mic open')) {
            addLog('system', msg)
          }
        } else if (data.event === 'utterance') {
          addLog('heard', data.hindi);
          addLog('translated', data.english);
          
          // AUTO-PERSIST TO LOCAL LOGS
          const now = new Date().toLocaleString('en-IN', { 
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true 
          });
          invoke('save_history_entry', { 
            sessionId: sessionRef.current || `session-${Date.now()}`,
            hindi: data.hindi, 
            english: data.english, 
            timestamp: now 
          })
          .then(() => console.log("History entry saved successfully"))
          .catch(e => {
            console.error("History save error:", e);
            addLog('system', `[HISTORY] Save Failed: ${e}`);
          });
        } else if (data.event === 'error') {
          addLog('system', `[CRITICAL] Error: ${data.message}`);
          setSidecarStatus('FAULT');
        }
      })

      unlistenError = await listen('sidecar-error', (event) => {
        if (!isMounted) return
        const line = String(event.payload).trim()
        if (line) addLog('system', `[ENGINE] ${line}`)
      })

      unlistenTerminated = await listen('sidecar-terminated', (event) => {
        if (!isMounted) return
        const code = event.payload
        addLog('system', `[ENGINE] Process exited (code ${code}). Click ↻ to restart.`)
        setSidecarStatus('FAULT')
        setInputDevices([{ id: -1, name: 'Engine crashed' }])
        setOutputDevices([{ id: -1, name: 'Engine crashed' }])
      })

      addLog('system', 'System Initialized')
      await requestDevices()
    }

    setupListeners()

    return () => {
      isMounted = false
      if (retryTimer) clearTimeout(retryTimer)
      if (unlistenFn) unlistenFn()
      if (unlistenError) unlistenError()
      if (unlistenTerminated) unlistenTerminated()
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setInputDevices([{ id: -1, name: 'Scanning...' }])
    setOutputDevices([{ id: -1, name: 'Scanning...' }])
    try {
      await invoke('send_sidecar_command', {
        cmd: JSON.stringify({ cmd: 'list_devices', force_rescan: true })
      })
    } catch {
      try {
        await invoke('restart_sidecar')
      } catch (err) {
        addLog('system', `[CRITICAL] Restart failed: ${err}`)
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 1500)
    }
  }

  useEffect(() => {
    if (isTranslating) {
      // VAD threshold formula: slider [20–100] → RMS floor [0.05–0.01].
      // Inverted so a *higher* slider value means *more* sensitive (lower RMS threshold).
      // Example: slider=65 (default) → threshold = (120-65)/2000 = 0.0275.
      // The same formula drives the needle position in the volume meter (÷2 for %).
      invoke('send_sidecar_command', {
        cmd: JSON.stringify({
          cmd: 'update_threshold',
          vad_threshold: (120 - vadLevel) / 2000
        })
      });
    }
  }, [vadLevel, isTranslating]);

  useEffect(() => {
    // LIVE SPEAKER SYNC: Switch voices mid-stream without stopping
    if (isTranslating) {
      invoke('send_sidecar_command', {
        cmd: JSON.stringify({
          cmd: 'update_speaker',
          speaker: selectedSpeaker
        })
      });
    }
  }, [selectedSpeaker, isTranslating]);

  const handleToggle = () => {
    const nextState = !isTranslating;
    setIsTranslating(nextState);

    if (nextState) {
      sessionRef.current = `session-${Date.now()}`;
      addLog('system', 'Initializing Translation Pipeline...');
      addLog('system', `[SESSION] ${sessionRef.current}`);
    } else {
      // Don't clear immediately to catch late utterances
      addLog('system', 'Translation Pipeline Terminated');
    }

    invoke('send_sidecar_command', {
      cmd: JSON.stringify({
        cmd: nextState ? 'start' : 'stop',
        in_device: inputDevice,
        out_device: outputDevice,
        speaker: selectedSpeaker,
        vad_threshold: (120 - vadLevel) / 2000
      })
    });
  }

  const handlePreview = async () => {
    setIsPreviewing(true)
    try {
      await invoke('send_sidecar_command', {
        cmd: JSON.stringify({ 
          cmd: 'preview_voice', 
          speaker: selectedSpeaker, 
          out_device: outputDevice,
          text: "At SyncSpeak, we are revolutionizing the way the world communicates by breaking down language barriers with our state-of-the-art real-time voice translation technology, ensuring that every professional meeting is seamless, natural, and crystal clear."
        })
      })
    } finally {
      setTimeout(() => setIsPreviewing(false), 2000)
    }
  }

  // Official high-fidelity Bulbul V3 voices from Sarvam AI Dashboard
  const speakers = [
    { id: 'shubh',  name: 'Shubh ♂'  },
    { id: 'sumit',  name: 'Sumit ♂'  },
    { id: 'amit',   name: 'Amit ♂'   },
    { id: 'manan',  name: 'Manan ♂'  },
    { id: 'rahul',  name: 'Rahul ♂'  },
    { id: 'ratan',  name: 'Ratan ♂'  },
    { id: 'ritu',   name: 'Ritu ♀'   },
    { id: 'pooja',  name: 'Pooja ♀'  },
    { id: 'simran', name: 'Simran ♀' },
    { id: 'kavya',  name: 'Kavya ♀'  },
    { id: 'priya',  name: 'Priya ♀'  },
    { id: 'ishita', name: 'Ishita ♀' },
    { id: 'shreya', name: 'Shreya ♀' },
    { id: 'shruti', name: 'Shruti ♀' },
  ];

  return (
    <div className="translate-page">
      <div className="dashboard-grid">
        <div className="config-panel ultra-compact">
          <div className="panel-header">
            <div className="header-left">
              <MicIcon />
              <label className="hig-label">Input Settings</label>
            </div>
            <button
              className={`refresh-btn ${isRefreshing ? 'loading' : 'orb'}`}
              onClick={handleRefresh}
              title="Refresh Devices"
            >
              ↻
            </button>
          </div>

          <div className="control-group">
            <label className="sub-label">Microphone Source</label>
            <GlassSelect value={inputDevice} options={inputDevices} onChange={setInputDevice} />
          </div>

          <div className="control-group">
            <label className="sub-label">Signal Level</label>
            <div className="volume-meter-container">
              <div
                className={`volume-meter-bar ${currentVolume > (120 - vadLevel) / 2 ? 'is-peaking' : ''}`}
                style={{ width: `${currentVolume}%` }}
              />
              <div className="threshold-needle" style={{ left: `${(120 - vadLevel) / 2}%` }} />
            </div>
          </div>
        </div>

        <div className="config-panel ultra-compact">
          <div className="panel-header">
            <div className="header-left">
              <SpeakerIcon />
              <label className="hig-label">Output Settings</label>
            </div>
            <div className="header-right">
              {(() => {
                const selected = outputDevices.find(d => d.id === outputDevice);
                if (!selected || selected.id === -1) return null;
                const isCable = selected.name.toLowerCase().includes('cable');
                return isCable ? (
                  <div className="routing-badge success">Ready</div>
                ) : (
                  <div className="routing-badge alert">Check Routing</div>
                );
              })()}
              <button
                className={`refresh-btn ${isRefreshing ? 'loading' : 'orb'}`}
                onClick={handleRefresh}
                title="Refresh Devices"
              >
                ↻
              </button>
            </div>
          </div>

          <div className="control-group">
            <label className="sub-label">Virtual Cable / Speaker</label>
            <GlassSelect value={outputDevice} options={outputDevices} onChange={setOutputDevice} />
          </div>

          <div className="control-group">
            <div className="label-row compact">
              <label className="sub-label">AI Persona</label>
              <button className="preview-mini-btn" onClick={handlePreview} disabled={isPreviewing}>
                {isPreviewing ? 'Wait' : 'Sample'}
              </button>
            </div>
            <GlassSelect value={selectedSpeaker} options={speakers} onChange={setSelectedSpeaker} />
          </div>
        </div>
      </div>

      <div className="dashboard-controls mini-bar">
        <div className="sensitivity-control">
          <label className="hig-label">Voice Sensitivity</label>
          <div className="slider-wrapper">
            <input
              type="range"
              min={20}
              max={100}
              value={vadLevel}
              onChange={e => {
                const val = Number(e.target.value);
                setVadLevel(val);
              }}
              style={{ '--progress': `${((vadLevel - 20) / (100 - 20)) * 100}%` } as React.CSSProperties}
            />
            <span className="vad-value">{vadLevel}%</span>
          </div>
        </div>

        <button className={`master-btn ${isTranslating ? 'is-active' : ''}`} onClick={handleToggle}>
          <span className="btn-icon">{isTranslating ? '■' : '▶'}</span>
          <span className="btn-text">{isTranslating ? 'STOP' : 'START TRANSLATION'}</span>
        </button>
      </div>

      <LiquidTerminal
        entries={logs}
        isLive={isTranslating}
        status={sidecarStatus}
      />
    </div>
  )
}
