import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { VoiceManager, DEFAULT_VOICE_SETTINGS } from './VoiceManager'
import type { VoiceSettings } from './VoiceManager'
import { socket } from './socket'

interface VoiceContextValue {
  isMuted: boolean
  isInVoice: boolean
  speakingUsers: Set<string>
  voiceSettings: VoiceSettings
  inputDevices: MediaDeviceInfo[]
  toggleMute: () => void
  joinVoice: () => void
  leaveVoice: () => void
  setVoiceSettings: (settings: Partial<VoiceSettings>) => void
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

const SETTINGS_KEY = 'wp_voice_settings'

function loadSettings(): VoiceSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(stored) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_VOICE_SETTINGS }
}

function saveSettings(settings: VoiceSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<VoiceManager | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [isInVoice, setIsInVoice] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set())
  const [voiceSettings, setVoiceSettingsState] = useState<VoiceSettings>(loadSettings)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    const manager = new VoiceManager(socket, voiceSettings)
    managerRef.current = manager

    manager.on('muted-change', () => {
      setIsMuted(manager.getIsMuted())
    })

    manager.on('voice-state-change', () => {
      setIsInVoice(manager.getIsInVoice())
    })

    manager.on('speaking-change', () => {
      setSpeakingUsers(manager.getSpeakingUsers())
    })

    // Enumerate input devices
    manager.getInputDevices().then(setInputDevices)

    // Listen for device changes
    const handleDeviceChange = () => {
      manager.getInputDevices().then(setInputDevices)
    }
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
      manager.destroy()
      managerRef.current = null
    }
    // Only init once; settings updates go through updateSettings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleMute = useCallback(() => {
    managerRef.current?.toggleMute()
  }, [])

  const joinVoice = useCallback(() => {
    managerRef.current?.joinVoice()
  }, [])

  const leaveVoice = useCallback(() => {
    managerRef.current?.leaveVoice()
  }, [])

  const setVoiceSettings = useCallback((newSettings: Partial<VoiceSettings>) => {
    setVoiceSettingsState((prev) => {
      const updated = { ...prev, ...newSettings }
      saveSettings(updated)
      managerRef.current?.updateSettings(newSettings)
      return updated
    })
  }, [])

  return (
    <VoiceContext.Provider
      value={{
        isMuted,
        isInVoice,
        speakingUsers,
        voiceSettings,
        inputDevices,
        toggleMute,
        joinVoice,
        leaveVoice,
        setVoiceSettings,
      }}
    >
      {children}
    </VoiceContext.Provider>
  )
}

export function useVoice() {
  const ctx = useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider')
  return ctx
}
