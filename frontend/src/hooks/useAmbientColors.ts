import { useEffect, useRef } from 'react'
import { extractPalette, paletteToThemeColors, interpolatePalette, type Palette } from '../lib/colorExtractor'
import { useTheme } from '../lib/ThemeContext'

const THUMBNAIL_URLS = (videoId: string) => [
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  `https://img.youtube.com/vi/${videoId}/1.jpg`,
  `https://img.youtube.com/vi/${videoId}/2.jpg`,
  `https://img.youtube.com/vi/${videoId}/3.jpg`,
]

// How long one full drift cycle takes (through all 4 palettes and back).
// Shorter = more dynamic. 32s means each palette pair blends over ~8s.
const DRIFT_CYCLE_MS = 32_000

export function useAmbientColors(videoId: string) {
  const { ambientEnabled, setAmbientColors } = useTheme()
  const palettesRef = useRef<Palette[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!ambientEnabled || !videoId) {
      setAmbientColors(null)
      cancelAnimationFrame(rafRef.current)
      return
    }

    let cancelled = false
    const urls = THUMBNAIL_URLS(videoId)

    // Extract all 4 palettes up front, then start drifting
    Promise.all(urls.map(url => extractPalette(url).catch(() => null)))
      .then(results => {
        if (cancelled) return
        const valid = results.filter((p): p is Palette => p !== null)
        if (valid.length === 0) return
        palettesRef.current = valid

        // Apply first palette immediately
        setAmbientColors(paletteToThemeColors(valid[0]))

        // Start the drift loop
        const startTime = performance.now()

        const drift = (now: number) => {
          if (cancelled) return
          const palettes = palettesRef.current
          const n = palettes.length
          if (n < 2) { rafRef.current = requestAnimationFrame(drift); return }

          // Sinusoidal position through the palette array for organic feel
          const elapsed = now - startTime
          const phase = (elapsed % DRIFT_CYCLE_MS) / DRIFT_CYCLE_MS
          // Smooth sinusoidal: goes 0→n-1→0 with easing
          const wave = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2 // 0..1
          const pos = wave * (n - 1) // 0..n-1
          const idx = Math.floor(pos)
          const t = pos - idx
          const from = palettes[Math.min(idx, n - 1)]
          const to = palettes[Math.min(idx + 1, n - 1)]

          const blended = interpolatePalette(from, to, t)
          setAmbientColors(paletteToThemeColors(blended))

          rafRef.current = requestAnimationFrame(drift)
        }

        rafRef.current = requestAnimationFrame(drift)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [videoId, ambientEnabled, setAmbientColors])
}
