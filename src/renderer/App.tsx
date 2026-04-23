import { useState } from 'react'
import TitleBar from './components/TitleBar'
import TabBar from './components/TabBar'
import AnimatedBackground from './components/AnimatedBackground'
import TranslatePage from './pages/TranslatePage'
import HistoryPage from './pages/HistoryPage'
import VoicesPage from './pages/VoicesPage'
import GuidePage from './pages/GuidePage'
import { useAppStore } from './store/appStore'
import { useSidecar } from './hooks/useSidecar'
import SettingsModal from './modals/SettingsModal'
import UpdatePrompt from './components/UpdatePrompt'
import './App.css'

type TabName = 'translate' | 'history' | 'guide' | 'voices'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('translate')
  const { showSettings, setShowSettings } = useAppStore()

  useSidecar()

  return (
    <div className="app">
      <AnimatedBackground />
      <TitleBar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onSettingsClick={() => setShowSettings(true)} 
      />

      <div className="page-container">
        {activeTab === 'translate' && <TranslatePage />}
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'guide' && <GuidePage />}
        {activeTab === 'voices' && <VoicesPage />}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <UpdatePrompt />
    </div>
  )
}
