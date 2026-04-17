import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './HistoryPage.css'

/**
 * Data shape for a single translation entry stored in local JSONL
 */
interface RawHistoryEntry {
  session_id: string;
  hindi: string;
  english: string;
  timestamp: string;
}

/**
 * Represent a group of translations belonging to one "Meeting" session
 */
interface SessionGroup {
  id: string;
  timestamp: string;
  phrases: RawHistoryEntry[];
}

/* --- OPTIMIZED SVG ASSETS --- */
const HistoryIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" className="glass-icon-svg">
    <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

/**
 * HistoryPage: Displays archived translation sessions from the local history.jsonl vault.
 * Focuses on high-fidelity visibility and "Liquid Glass" aesthetics.
 */
export default function HistoryPage() {
  const [rawData, setRawData] = useState<RawHistoryEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Group raw flat logs into session-based Meeting headers.
   * Optimized with useMemo to prevent unnecessary re-processing on every render.
   */
  const groupedSessions = useMemo(() => {
    const groups: { [key: string]: SessionGroup } = {};
    rawData.forEach(entry => {
      const sId = entry.session_id || 'legacy';
      if (!groups[sId]) {
        groups[sId] = {
          id: sId,
          timestamp: entry.timestamp,
          phrases: []
        };
      }
      groups[sId].phrases.push(entry);
    });
    return Object.values(groups).reverse();
  }, [rawData]);

  /**
   * Loads logs from the Rust backend history handler.
   */
  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<RawHistoryEntry[]>('get_history');
      setRawData(data);
    } catch (err) {
      console.error('History Sync Failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Destructive action to wipe the local history.jsonl file.
   */
  const handleClear = async () => {
    if (window.confirm('Delete all history permanently? This cannot be undone.')) {
      try {
        await invoke('clear_history')
        setRawData([])
      } catch (err) {
        console.error('Clear failed:', err)
      }
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  return (
    <div className="history-page">
      <div className="history-header-bar">
        <div className="history-title-group">
          <HistoryIcon />
          <h2>History Log</h2>
        </div>
        <div className="history-header-actions">
          <button className="refresh-history-btn" onClick={loadHistory} title="Sync Local Logs">↻</button>
          {groupedSessions.length > 0 && (
            <button className="clear-history-btn" onClick={handleClear}>
              <TrashIcon />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="history-container">
        {isLoading ? (
          <div className="history-empty-state">
            <p className="frosted-text">Accessing secure log files...</p>
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="history-empty-state">
            <div className="empty-icon-circle">🎞️</div>
            <p className="frosted-text">Your translation history will appear here.</p>
          </div>
        ) : (
          <div className="sessions-list">
            {groupedSessions.map((session) => (
              <div 
                key={session.id} 
                className={`session-card-glass ${expandedId === session.id ? 'is-expanded' : ''}`}
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
              >
                <div className="session-card-header">
                  <div className="session-info">
                    <span className="session-start-tag">{session.timestamp}</span>
                    <span className="session-phrase-count">{session.phrases.length} PHRASES</span>
                  </div>
                  <div className="session-card-arrow">▼</div>
                </div>

                {expandedId === session.id && (
                  <div className="session-transcript-area">
                    <div className="transcript-divider" />
                    {session.phrases.map((phrase, pIdx) => (
                      <div key={pIdx} className="transcript-entry">
                        <div className="t-row">
                          <span className="t-tag hi">HI</span>
                          <span className="t-text hindi">{phrase.hindi}</span>
                        </div>
                        <div className="t-row">
                          <span className="t-tag en">EN</span>
                          <span className="t-text english">{phrase.english}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
