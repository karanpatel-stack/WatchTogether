import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { ScreenShareManager } from './ScreenShareManager'
import { socket } from './socket'

interface ScreenShareContextValue {
  isSharing: boolean
  isViewing: boolean
  sharerId: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  screenError: string | null
  startSharing: () => void
  stopSharing: () => void
  setInitialState: (sharerId: string | null) => void
}

const ScreenShareContext = createContext<ScreenShareContextValue | null>(null)

export function ScreenShareProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<ScreenShareManager | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [sharerId, setSharerId] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)

  useEffect(() => {
    const manager = new ScreenShareManager(socket)
    managerRef.current = manager

    manager.on('state-change', () => {
      setIsSharing(manager.isSharing)
      setIsViewing(manager.isViewing)
      setSharerId(manager.sharerId)
      setLocalStream(manager.localStream)
      setRemoteStream(manager.remoteStream)
    })

    manager.on('stream-received', () => {
      setRemoteStream(manager.remoteStream)
    })

    manager.on('stream-ended', () => {
      setRemoteStream(null)
    })

    manager.on('error', (err) => {
      setScreenError(err as string)
    })

    return () => {
      manager.destroy()
      managerRef.current = null
    }
  }, [])

  const startSharing = useCallback(() => {
    setScreenError(null)
    managerRef.current?.startSharing()
  }, [])

  const stopSharing = useCallback(() => {
    managerRef.current?.stopSharing()
  }, [])

  const setInitialState = useCallback((sharerId: string | null) => {
    managerRef.current?.setInitialState(sharerId)
  }, [])

  return (
    <ScreenShareContext.Provider
      value={{
        isSharing,
        isViewing,
        sharerId,
        localStream,
        remoteStream,
        screenError,
        startSharing,
        stopSharing,
        setInitialState,
      }}
    >
      {children}
    </ScreenShareContext.Provider>
  )
}

export function useScreenShare() {
  const ctx = useContext(ScreenShareContext)
  if (!ctx) throw new Error('useScreenShare must be used within ScreenShareProvider')
  return ctx
}
