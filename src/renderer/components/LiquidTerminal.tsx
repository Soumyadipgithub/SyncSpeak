import React, { useEffect, useRef, useState } from 'react';
import './LiquidTerminal.css';

interface LogEntry {
  id: string;
  type: 'heard' | 'translated' | 'system' | 'speaker';
  content: string;
  timestamp: string;
  subtext?: string;
}

interface LiquidTerminalProps {
  entries: LogEntry[];
  isLive: boolean;
  status: string;
}

const MicIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5V23M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const RobotIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" width="18" height="15" rx="3" fill="currentColor" />
    <path d="M7 6H10M14 6H17M9 11H15" stroke="black" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 15V21M8 21H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const SystemIcon = () => (
  <span style={{ fontSize: '10px' }}>⚡</span>
);

export const LiquidTerminal: React.FC<LiquidTerminalProps> = ({ entries, isLive, status }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleCopy = (entry: LogEntry) => {
    navigator.clipboard.writeText(entry.content).then(() => {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  return (
    <div className="liquid-terminal-container">
      <div className="terminal-header">
        <div className="header-label">
          <div className={`status-orb ${isLive ? 'live' : 'idle'}`} />
          <span>LIVE TRANSCRIPTION LOG</span>
        </div>
        <div className="header-status">{status}</div>
      </div>

      <div className="terminal-body">
        {entries.length === 0 ? (
          <div className="terminal-empty-state">
            <span className="prompt">&gt;</span>
            <span className="cursor-dot" />
            <span className="empty-text">Awaiting Hardware Initialization...</span>
          </div>
        ) : (
          <div className="terminal-scroll-area">
            {entries.map((entry) => (
              <div key={entry.id} className={`terminal-line ${entry.type}`}>
                <div className="line-prefix">
                  {entry.type === 'heard' && (
                    <div className="icon-wrapper mic">
                      <MicIcon />
                      <span className="tag">Heard (Hindi)</span>
                    </div>
                  )}
                  {entry.type === 'translated' && (
                    <div className="icon-wrapper robot">
                      <RobotIcon />
                      <span className="tag">Translated (EN)</span>
                    </div>
                  )}
                  {entry.type === 'speaker' && (
                    <div className="icon-wrapper speaker">
                      <SpeakerIcon />
                      <span className="tag">Routing Info</span>
                    </div>
                  )}
                  {entry.type === 'system' && (
                    <div className="icon-wrapper system">
                      <SystemIcon />
                      <span className="tag">Trace</span>
                    </div>
                  )}
                </div>
                <div className="line-content">
                  <span className="main-text">{entry.content}</span>
                  {entry.subtext && <span className="sub-text">{entry.subtext}</span>}
                </div>
                <div className="line-actions">
                  {(entry.type === 'heard' || entry.type === 'translated') && (
                    <button
                      className={`copy-btn ${copiedId === entry.id ? 'copied' : ''}`}
                      onClick={() => handleCopy(entry)}
                      title="Copy"
                    >
                      {copiedId === entry.id ? '✓' : '⎘'}
                    </button>
                  )}
                  <div className="line-timestamp">{entry.timestamp}</div>
                </div>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
