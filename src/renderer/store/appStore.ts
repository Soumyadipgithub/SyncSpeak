import { create } from 'zustand'

export interface TranscriptEntry {
  id: number
  original: string
  translated: string
  timestamp: string
}

export interface HistorySession {
  id: number
  date: string
  duration: string
  entries: { original: string; translated: string }[]
}

interface AppState {
  // Translation
  isTranslating: boolean
  transcript: TranscriptEntry[]
  inputDevice: string
  outputDevice: string
  selectedVoice: string

  // Settings
  vadSensitivity: number
  silenceDuration: number
  outputVolume: number

  // Sidecar
  sidecarReady: boolean
  apiKeyValid: boolean
  groqKeyValid: boolean
  showSettings: boolean

  // Actions
  setTranslating: (v: boolean) => void
  addTranscriptEntry: (entry: TranscriptEntry) => void
  clearTranscript: () => void
  setInputDevice: (d: string) => void
  setOutputDevice: (d: string) => void
  setSelectedVoice: (v: string) => void
  setVadSensitivity: (v: number) => void
  setSilenceDuration: (v: number) => void
  setOutputVolume: (v: number) => void
  setSidecarReady: (v: boolean) => void
  setApiKeyValid: (v: boolean) => void
  setGroqKeyValid: (v: boolean) => void
  setShowSettings: (v: boolean) => void
  setAppMetadata: (name: string, version: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  isTranslating: false,
  transcript: [],
  inputDevice: 'default',
  outputDevice: 'CABLE Input',
  selectedVoice: 'meera',

  vadSensitivity: 65,
  silenceDuration: 1.5,
  outputVolume: 80,

  sidecarReady: false,
  apiKeyValid: false,
  groqKeyValid: false,
  showSettings: false,

  setTranslating: (v) => set({ isTranslating: v }),
  addTranscriptEntry: (entry) =>
    set((s) => ({ transcript: [...s.transcript, entry] })),
  clearTranscript: () => set({ transcript: [] }),
  setInputDevice: (d) => set({ inputDevice: d }),
  setOutputDevice: (d) => set({ outputDevice: d }),
  setSelectedVoice: (v) => set({ selectedVoice: v }),
  setVadSensitivity: (v) => set({ vadSensitivity: v }),
  setSilenceDuration: (v) => set({ silenceDuration: v }),
  setOutputVolume: (v) => set({ outputVolume: v }),
  setSidecarReady: (v) => set({ sidecarReady: v }),
  setApiKeyValid: (v) => set({ apiKeyValid: v }),
  setGroqKeyValid: (v) => set({ groqKeyValid: v }),
  setShowSettings: (v) => set({ showSettings: v }),
}))
