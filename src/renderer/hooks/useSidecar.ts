import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store/appStore'

export function useSidecar() {
  const { setSidecarReady, addTranscriptEntry, setTranslating, setApiKeyValid, setGroqKeyValid } = useAppStore()

  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListeners = async () => {
      // 1. Load saved API keys and send them to sidecar immediately
      const savedKey = await invoke<string | null>('get_config', { key: 'sarvam_api_key' })
      if (savedKey) {
        invoke('send_sidecar_command', {
          cmd: JSON.stringify({ cmd: 'update_api_key', api_key: savedKey })
        })
      }

      const savedGroqKey = await invoke<string | null>('get_config', { key: 'groq_api_key' })
      if (savedGroqKey) {
        invoke('send_sidecar_command', {
          cmd: JSON.stringify({ cmd: 'update_groq_key', api_key: savedGroqKey })
        })
      }

      unlisten = await listen('sidecar-event', (event) => {
        const data = event.payload as { event: string; [key: string]: unknown }

        switch (data.event) {
          case 'auth_result':
            setApiKeyValid(data.status === 'success')
            break
          case 'groq_auth_result':
            setGroqKeyValid(data.status === 'success')
            break
          case 'ready':
            setSidecarReady(true)
            break
          case 'utterance':
            addTranscriptEntry({
              id: Date.now(),
              original: String(data.hindi || ''),
              translated: String(data.english || ''),
              timestamp: String(data.timestamp || new Date().toLocaleTimeString()),
            })
            break
          case 'status':
            if (data.state === 'stopped' || data.state === 'error') {
              setTranslating(false)
            }
            break
          case 'error':
            console.error('[Sidecar Error]', data.message)
            break
        }
      })
    }

    setupListeners()

    return () => {
      if (unlisten) unlisten()
    }
  }, [setSidecarReady, addTranscriptEntry, setTranslating, setApiKeyValid, setGroqKeyValid])
}
