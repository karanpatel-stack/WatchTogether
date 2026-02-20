import { useRef, useEffect, useCallback } from 'react'

interface AmbientBackgroundProps {
  videoId: string
  enabled: boolean
}

const CANVAS_W = 160
const CANVAS_H = 90

export default function AmbientBackground({ videoId, enabled }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevVideoRef = useRef('')

  const drawThumbnail = useCallback((vid: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
    }
    img.src = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`
  }, [])

  useEffect(() => {
    if (!enabled || !videoId) return
    if (videoId === prevVideoRef.current) return
    prevVideoRef.current = videoId
    drawThumbnail(videoId)
  }, [videoId, enabled, drawThumbnail])

  if (!enabled || !videoId) return null

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          position: 'absolute',
          top: '-20%',
          left: '-15%',
          width: '130%',
          height: '140%',
          filter: 'blur(90px) saturate(1.4)',
          opacity: 0.28,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
