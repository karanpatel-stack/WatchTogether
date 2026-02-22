import { useEffect, useRef, useCallback } from 'react'
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube'
import type { VideoState } from '../lib/types'

interface Props {
  videoState: VideoState
  heartbeat: VideoState | null
  onPlay: () => void
  onPause: (currentTime: number) => void
  onSeek: (currentTime: number) => void
  onEnd?: () => void
}

export default function VideoPlayer({ videoState, heartbeat, onPlay, onPause, onSeek, onEnd }: Props) {
  const playerRef = useRef<YouTubePlayer | null>(null)
  const isRemoteUpdate = useRef(false)
  const remoteUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastProcessedSeq = useRef(0)
  const seekDetectorLastTime = useRef(0)
  const playDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setRemoteLock = useCallback((duration: number) => {
    isRemoteUpdate.current = true
    if (remoteUpdateTimer.current) clearTimeout(remoteUpdateTimer.current)
    remoteUpdateTimer.current = setTimeout(() => {
      isRemoteUpdate.current = false
      remoteUpdateTimer.current = null
    }, duration)
  }, [])

  const syncPlayer = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (videoState.seq <= lastProcessedSeq.current) return
    lastProcessedSeq.current = videoState.seq

    setRemoteLock(200)

    // Server already computed the expected position at send time —
    // use directly, no cross-clock math needed.
    const targetTime = videoState.currentTime

    try {
      const currentTime = player.getCurrentTime()
      const diff = Math.abs(currentTime - targetTime)

      if (diff > 1) {
        // Longer lock for seeks to cover YouTube buffering/state changes
        setRemoteLock(800)
        player.seekTo(targetTime, true)
        seekDetectorLastTime.current = targetTime
      }

      const playerState = player.getPlayerState()
      if (videoState.isPlaying && playerState !== 1) {
        player.playVideo()
      } else if (!videoState.isPlaying && playerState === 1) {
        player.pauseVideo()
      }

      if (player.getPlaybackRate() !== videoState.playbackRate) {
        player.setPlaybackRate(videoState.playbackRate)
      }
    } catch {
      // Player not ready yet
    }
  }, [videoState, setRemoteLock])

  useEffect(() => {
    syncPlayer()
  }, [syncPlayer])

  // Heartbeat correction: safety net for missed sync events (2s threshold)
  useEffect(() => {
    if (!heartbeat) return
    const player = playerRef.current
    if (!player) return

    try {
      // Server computed position at send time — use directly
      const expectedTime = heartbeat.currentTime

      // Fix play/pause mismatch
      const playerState = player.getPlayerState()
      if (heartbeat.isPlaying && playerState !== 1) {
        setRemoteLock(200)
        player.playVideo()
      } else if (!heartbeat.isPlaying && playerState === 1) {
        setRemoteLock(200)
        player.pauseVideo()
      }

      // Fix time drift > 2s
      if (heartbeat.isPlaying) {
        const currentTime = player.getCurrentTime()
        const diff = Math.abs(currentTime - expectedTime)
        if (diff > 2) {
          setRemoteLock(500)
          player.seekTo(expectedTime, true)
          seekDetectorLastTime.current = expectedTime
        }
      }

      // Fix playback rate mismatch
      if (player.getPlaybackRate() !== heartbeat.playbackRate) {
        player.setPlaybackRate(heartbeat.playbackRate)
      }
    } catch {
      // Player not ready
    }
  }, [heartbeat, setRemoteLock])

  // Visibility change: reset seq so next update is always processed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastProcessedSeq.current = 0
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (playDebounceTimer.current) clearTimeout(playDebounceTimer.current)
      if (pauseDebounceTimer.current) clearTimeout(pauseDebounceTimer.current)
      if (remoteUpdateTimer.current) clearTimeout(remoteUpdateTimer.current)
    }
  }, [])

  const onReady = (event: YouTubeEvent) => {
    playerRef.current = event.target
    // Reset seq tracking so first sync always applies
    lastProcessedSeq.current = 0
    syncPlayer()
  }

  const onStateChange = (event: YouTubeEvent) => {
    if (isRemoteUpdate.current) return

    const player = event.target
    const state = event.data
    const currentTime = player.getCurrentTime()

    // Playing
    if (state === 1) {
      if (pauseDebounceTimer.current) {
        clearTimeout(pauseDebounceTimer.current)
        pauseDebounceTimer.current = null
      }
      if (playDebounceTimer.current) clearTimeout(playDebounceTimer.current)
      playDebounceTimer.current = setTimeout(() => {
        onPlay()
        playDebounceTimer.current = null
      }, 100)
    }
    // Paused
    else if (state === 2) {
      if (playDebounceTimer.current) {
        clearTimeout(playDebounceTimer.current)
        playDebounceTimer.current = null
      }
      if (pauseDebounceTimer.current) clearTimeout(pauseDebounceTimer.current)
      pauseDebounceTimer.current = setTimeout(() => {
        onPause(currentTime)
        pauseDebounceTimer.current = null
      }, 100)
    }
    // Ended
    else if (state === 0) {
      onEnd?.()
    }
  }

  const handleSeek = () => {
    if (isRemoteUpdate.current || !playerRef.current) return
    const currentTime = playerRef.current.getCurrentTime()
    onSeek(currentTime)
  }

  return (
    <div className="absolute inset-0">
      <YouTube
        videoId={videoState.videoId}
        className="w-full h-full"
        iframeClassName="w-full h-full"
        opts={{
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            origin: window.location.origin,
          },
        }}
        onReady={onReady}
        onStateChange={onStateChange}
        onPlaybackRateChange={() => {}}
        onEnd={() => {}}
      />
      {/* Invisible overlay to capture seek events via timeupdate polling */}
      <SeekDetector playerRef={playerRef} onSeek={handleSeek} isRemoteUpdate={isRemoteUpdate} seekDetectorLastTime={seekDetectorLastTime} />
    </div>
  )
}

function SeekDetector({
  playerRef,
  onSeek,
  isRemoteUpdate,
  seekDetectorLastTime,
}: {
  playerRef: React.MutableRefObject<YouTubePlayer | null>
  onSeek: () => void
  isRemoteUpdate: React.MutableRefObject<boolean>
  seekDetectorLastTime: React.MutableRefObject<number>
}) {
  useEffect(() => {
    const interval = setInterval(() => {
      if (!playerRef.current || isRemoteUpdate.current) return
      try {
        const currentTime = playerRef.current.getCurrentTime()
        const diff = Math.abs(currentTime - seekDetectorLastTime.current)
        if (diff > 1 && seekDetectorLastTime.current > 0) {
          onSeek()
        }
        seekDetectorLastTime.current = currentTime
      } catch {
        // Player not ready
      }
    }, 250)

    return () => clearInterval(interval)
  }, [playerRef, onSeek, isRemoteUpdate, seekDetectorLastTime])

  return null
}
