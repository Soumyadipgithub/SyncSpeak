import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import logo from '../assets/logo.png'
import './TitleBar.css'

interface TitleBarProps {
  activeTab: 'translate' | 'history' | 'guide' | 'voices'
  onTabChange: (tab: 'translate' | 'history' | 'guide' | 'voices') => void
  onSettingsClick: () => void
}

const appWindow = getCurrentWindow();

export default function TitleBar({ activeTab, onTabChange, onSettingsClick }: TitleBarProps) {
  const [isMax, setIsMax] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const prevIndexRef = useRef<number>(0);

  useEffect(() => {
    const checkState = async () => {
      setIsMax(await appWindow.isMaximized());
    };
    checkState();
    const unlisten = appWindow.onResized(() => { checkState(); });
    return () => { unlisten.then(f => f()); };
  }, []);

  const tabs = [
    { id: 'translate', label: 'Translate' },
    { id: 'history', label: 'History' },
    { id: 'guide', label: 'Guide' },
  ] as const

  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  useEffect(() => {
    if (activeIndex > prevIndexRef.current) setDirection('right');
    else if (activeIndex < prevIndexRef.current) setDirection('left');
    const timer = setTimeout(() => setDirection(null), 500);
    prevIndexRef.current = activeIndex;
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <img src={logo} className="titlebar-logo" alt="Logo" />
        
        {/* --- ULTIMATE LIQUID GLASS BRANDING ENGINE --- */}
        <div className="brand-lens-container">
          <svg viewBox="0 0 240 40" width="180" height="30" className="glass-title-svg">
            <defs>
              {/* THE LIQUID TEXT FILTER (High Specular, Low Fill) */}
              <filter id="apple-liquid-glass-v6" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="1.0" result="blur" />
                <feSpecularLighting in="blur" surfaceScale="7" specularConstant="2.2" specularExponent="75" lightingColor="#ffffff" result="specular">
                  <fePointLight x="-100" y="-150" z="250" />
                </feSpecularLighting>
                <feComposite in="specular" in2="SourceAlpha" operator="in" result="glint" />
                <feOffset in="glint" dx="0.5" dy="0.5" result="offsetGlint" />
                
                <feDiffuseLighting in="blur" surfaceScale="5" diffuseConstant="0.8" lightingColor="rgba(255,255,255,0.4)">
                  <fePointLight x="100" y="100" z="100" />
                </feDiffuseLighting>
                <feComposite in2="SourceAlpha" operator="in" result="volume" />
                
                <feMerge>
                  <feMergeNode in="volume" />
                  <feMergeNode in="offsetGlint" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <text 
              x="0" 
              y="30" 
              fontFamily="'Outfit', 'Inter', -apple-system, sans-serif" 
              fontWeight="800" 
              fontSize="27" 
              fill="rgba(255, 255, 255, 0.15)"  /* TRANSPARENT LIQUID CORE */
              filter="url(#apple-liquid-glass-v6)"
              style={{ letterSpacing: '-0.03em' }}
            >
              Sync Speak
            </text>
          </svg>
        </div>
      </div>

      <div className="titlebar-nav" data-tauri-drag-region>
        <div className="tab-bar">
          {activeIndex !== -1 && (
            <div 
              className={`tab-active-indicator ${direction ? `morph-${direction}` : ''}`}
              style={{ 
                left: `calc(3px + (${activeIndex} * (100% / ${tabs.length})))`,
                width: `calc(100% / ${tabs.length} - 6px)`
              }} 
            >
              <div className="glass-specular-overlay" />
            </div>
          )}
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              style={{ width: `${100 / tabs.length}%` }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="titlebar-controls" data-tauri-drag-region>
        <button className="titlebar-btn" title="Settings" onClick={onSettingsClick}>⚙</button>
        <button className="titlebar-btn" title="Minimize" onClick={() => appWindow.minimize()}>─</button>
        <button className="titlebar-btn" title={isMax ? "Restore" : "Maximize"} onClick={async () => { if (isMax) { await appWindow.unmaximize(); } else { await appWindow.maximize(); } }}>
          {isMax ? "❐" : "□"}
        </button>
        <button className="titlebar-btn close" title="Close" onClick={() => appWindow.close()}>✕</button>
      </div>
    </div>
  )
}
