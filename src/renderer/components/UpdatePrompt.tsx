import { useUpdater } from '../hooks/useUpdater'
import './UpdatePrompt.css'

export default function UpdatePrompt() {
  const { updateStatus, updateAvailable, handleRestart } = useUpdater()

  if (updateStatus !== 'ready' || !updateAvailable) {
    return null
  }

  return (
    <div className="update-prompt-overlay">
      <div className="glass-card update-prompt-modal">
        <div className="update-prompt-content">
          <h3 className="hig-label" style={{ color: 'var(--accent-blue)', fontSize: '12px' }}>Update Ready</h3>
          <p className="hig-body">SyncSpeak version {updateAvailable.version} has been downloaded and is ready to install.</p>
          <div className="update-prompt-actions">
            <button className="gradient-btn update-restart-btn" onClick={handleRestart}>
              Restart Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
