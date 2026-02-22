import { useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import type { VideoState } from '../lib/types'

interface Props {
  videoState: VideoState
  onPlay: (currentTime: number) => void
  onPause: (currentTime: number) => void
  onSeek: (currentTime: number) => void
  onEnd?: () => void
}

export default function DirectVideoPlayer({ videoState, onPlay, onPause, onSeek, onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const isRemoteUpdate = useRef(false)
  const remoteUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastProcessedSeq = useRef(0)
  const playDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeekTime = useRef(0)
  const videoStateRef = useRef(videoState)
  videoStateRef.current = videoState
  const driftBurstInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const isHlsUrl = /\.m3u8(\?.*)?$/i.test(videoState.videoUrl)

  const setRemoteLock = useCallback((duration: number) => {
    isRemoteUpdate.current = true
    if (remoteUpdateTimer.current) clearTimeout(remoteUpdateTimer.current)
    remoteUpdateTimer.current = setTimeout(() => {
      isRemoteUpdate.current = false
      remoteUpdateTimer.current = null
    }, duration)
  }, [])

  // Setup HLS or native source
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Reset sequence tracking on new video
    lastProcessedSeq.current = 0

    // Destroy previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (isHlsUrl) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        })
        hlsRef.current = hls
        hls.loadSource(videoState.videoUrl)
        hls.attachMedia(video)
        // Auto-play once manifest is parsed
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (videoState.isPlaying) {
            video.play().catch(() => {})
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = videoState.videoUrl
      }
    } else {
      video.src = videoState.videoUrl
    }

    // Auto-play the new source if server says isPlaying
    const handleCanPlay = () => {
      if (videoState.isPlaying && video.paused) {
        setRemoteLock(200)
        video.play().catch(() => {})
      }
    }
    video.addEventListener('canplay', handleCanPlay, { once: true })

    return () => {
      video.removeEventListener('canplay', handleCanPlay)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
    // Only re-run when the video URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoState.videoUrl])

  // Burst drift correction: runs every 1s for 6s after a sync event
  const startDriftBurst = useCallback(() => {
    if (driftBurstInterval.current) clearInterval(driftBurstInterval.current)
    let count = 0
    driftBurstInterval.current = setInterval(() => {
      count++
      if (count >= 6) {
        if (driftBurstInterval.current) clearInterval(driftBurstInterval.current)
        driftBurstInterval.current = null
        return
      }
      const video = videoRef.current
      if (!video || isRemoteUpdate.current) return
      const vs = videoStateRef.current
      if (!vs.isPlaying) return
      const elapsed = (Date.now() - vs.timestamp) / 1000
      const expectedTime = vs.currentTime + elapsed
      const diff = Math.abs(video.currentTime - expectedTime)
      if (diff > 1) {
        setRemoteLock(200)
        video.currentTime = expectedTime
        lastSeekTime.current = expectedTime
      }
    }, 1000)
  }, [setRemoteLock])

  const syncPlayer = useCallback(() => {
    const video = videoRef.current
    if (!video || isRemoteUpdate.current) return
    if (videoState.seq <= lastProcessedSeq.current) return
    lastProcessedSeq.current = videoState.seq

    setRemoteLock(200)

    const elapsed = (Date.now() - videoState.timestamp) / 1000
    const targetTime = videoState.isPlaying
      ? videoState.currentTime + elapsed
      : videoState.currentTime

    const diff = Math.abs(video.currentTime - targetTime)
    if (diff > 1) {
      video.currentTime = targetTime
      lastSeekTime.current = targetTime
    }

    if (videoState.isPlaying && video.paused) {
      video.play().catch(() => {})
    } else if (!videoState.isPlaying && !video.paused) {
      video.pause()
    }

    if (video.playbackRate !== videoState.playbackRate) {
      video.playbackRate = videoState.playbackRate
    }

    // Start burst drift correction for the next 6 seconds
    startDriftBurst()
  }, [videoState, setRemoteLock, startDriftBurst])

  useEffect(() => {
    syncPlayer()
  }, [syncPlayer])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (playDebounceTimer.current) clearTimeout(playDebounceTimer.current)
      if (pauseDebounceTimer.current) clearTimeout(pauseDebounceTimer.current)
      if (remoteUpdateTimer.current) clearTimeout(remoteUpdateTimer.current)
      if (driftBurstInterval.current) clearInterval(driftBurstInterval.current)
    }
  }, [])

  const handlePlay = () => {
    if (isRemoteUpdate.current) return
    const video = videoRef.current
    if (!video) return

    if (pauseDebounceTimer.current) {
      clearTimeout(pauseDebounceTimer.current)
      pauseDebounceTimer.current = null
    }
    if (playDebounceTimer.current) clearTimeout(playDebounceTimer.current)
    playDebounceTimer.current = setTimeout(() => {
      onPlay(video.currentTime)
      playDebounceTimer.current = null
    }, 100)
  }

  const handlePause = () => {
    if (isRemoteUpdate.current) return
    const video = videoRef.current
    if (!video) return

    if (playDebounceTimer.current) {
      clearTimeout(playDebounceTimer.current)
      playDebounceTimer.current = null
    }
    if (pauseDebounceTimer.current) clearTimeout(pauseDebounceTimer.current)
    pauseDebounceTimer.current = setTimeout(() => {
      onPause(video.currentTime)
      pauseDebounceTimer.current = null
    }, 100)
  }

  const handleSeeked = () => {
    if (isRemoteUpdate.current) return
    const video = videoRef.current
    if (!video) return

    const diff = Math.abs(video.currentTime - lastSeekTime.current)
    if (diff > 1) {
      onSeek(video.currentTime)
    }
    lastSeekTime.current = video.currentTime
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    lastSeekTime.current = video.currentTime
  }

  const handleEnded = () => {
    onEnd?.()
  }

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        autoPlay={false}
        playsInline
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeked={handleSeeked}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    </div>
  )
}
