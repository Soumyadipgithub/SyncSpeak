import './TabBar.css'

interface TabBarProps {
  activeTab: 'translate' | 'history' | 'guide'
  onTabChange: (tab: 'translate' | 'history' | 'guide') => void
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs = [
    { id: 'translate', label: 'TRANSLATE' },
    { id: 'history', label: 'HISTORY' },
    { id: 'guide', label: 'GUIDE' },
  ] as const

  const activeIndex = tabs.findIndex(t => t.id === activeTab)

  return (
    <div className="tabs-container">
      <div className="tab-bar">
        {/* Dynamic Highlight Island */}
        <div 
          className="tab-active-indicator" 
          style={{ 
            left: `calc(4px + (${activeIndex} * (100% / ${tabs.length})))`,
            width: `calc(100% / ${tabs.length} - 8px)`
          }} 
        />
        
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
  )
}
