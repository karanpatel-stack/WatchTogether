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
  const lastProcessedSeq = useRef(0)
  const playDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeekTime = useRef(0)

  const isHlsUrl = /\.m3u8(\?.*)?$/i.test(videoState.videoUrl)

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
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = videoState.videoUrl
      }
    } else {
      video.src = videoState.videoUrl
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
    // Only re-run when the video URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoState.videoUrl])

  const syncPlayer = useCallback(() => {
    const video = videoRef.current
    if (!video || isRemoteUpdate.current) return
    if (videoState.seq <= lastProcessedSeq.current) return
    lastProcessedSeq.current = videoState.seq

    isRemoteUpdate.current = true

    const elapsed = (Date.now() - videoState.timestamp) / 1000
    const targetTime = videoState.isPlaying
      ? videoState.currentTime + elapsed
      : videoState.currentTime

    const diff = Math.abs(video.currentTime - targetTime)
    if (diff > 1.5) {
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

    setTimeout(() => {
      isRemoteUpdate.current = false
    }, 800)
  }, [videoState])

  useEffect(() => {
    syncPlayer()
  }, [syncPlayer])

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      if (playDebounceTimer.current) clearTimeout(playDebounceTimer.current)
      if (pauseDebounceTimer.current) clearTimeout(pauseDebounceTimer.current)
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
    }, 150)
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
    }, 150)
  }

  const handleSeeked = () => {
    if (isRemoteUpdate.current) return
    const video = videoRef.current
    if (!video) return

    const diff = Math.abs(video.currentTime - lastSeekTime.current)
    if (diff > 2) {
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
