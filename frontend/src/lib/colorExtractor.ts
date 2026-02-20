import type { Theme } from './themes'

export type ThemeColors = Theme['colors']

export interface RGB {
  r: number
  g: number
  b: number
}

export interface Palette {
  primary: RGB
  secondary: RGB
  tertiary: RGB
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

/**
 * Extract a dominant color palette from an image URL using canvas pixel sampling.
 */
export function extractPalette(imageUrl: string): Promise<Palette> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const W = 50, H = 38
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, W, H)
      const data = ctx.getImageData(0, 0, W, H).data

      const buckets = new Map<string, { r: number; g: number; b: number; count: number }>()
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const lum = (r * 0.299 + g * 0.587 + b * 0.114)
        if (lum < 25 || lum > 230) continue
        const sat = max === 0 ? 0 : (max - min) / max
        if (sat < 0.15) continue

        const qr = (r >> 4) << 4
        const qg = (g >> 4) << 4
        const qb = (b >> 4) << 4
        const key = `${qr},${qg},${qb}`
        const existing = buckets.get(key)
        if (existing) {
          existing.r += r; existing.g += g; existing.b += b; existing.count++
        } else {
          buckets.set(key, { r, g, b, count: 1 })
        }
      }

      const sorted = [...buckets.values()]
        .sort((a, b) => b.count - a.count)
        .map(b => ({
          r: Math.round(b.r / b.count),
          g: Math.round(b.g / b.count),
          b: Math.round(b.b / b.count),
        }))

      const primary = sorted[0] || { r: 220, g: 38, b: 38 }
      const secondary = sorted[1] || shiftHue(primary, 30)
      const tertiary = sorted[2] || shiftHue(primary, -30)

      resolve({ primary, secondary, tertiary })
    }
    img.onerror = () => reject(new Error('Failed to load thumbnail'))
    img.src = imageUrl
  })
}

function shiftHue(color: RGB, degrees: number): RGB {
  const [h, s, l] = rgbToHsl(color.r, color.g, color.b)
  return hslToRgb((h + degrees + 360) % 360, s, l)
}

/**
 * Convert a palette to theme CSS variable values.
 * Text is always pushed to high lightness + low saturation for readability.
 * Accent shades stay tinted but are clamped to safe ranges for dark UI.
 */
export function paletteToThemeColors(palette: Palette): ThemeColors {
  const { r, g, b } = palette.primary
  const [h, s] = rgbToHsl(r, g, b)

  // Clamp saturation but keep it punchy enough to feel the video's influence
  const cs = Math.min(s, 0.8)

  const accent400 = hslToRgb(h, cs, 0.65)
  const accent500 = hslToRgb(h, cs, 0.50)
  const accent600 = hslToRgb(h, cs, 0.42)
  const accent700 = hslToRgb(h, cs, 0.34)
  const accent800 = hslToRgb(h, cs, 0.26)
  const accent900 = hslToRgb(h, cs, 0.18)

  // Text: high lightness (0.78+), low saturation (0.35) — always crisp on dark bg
  const textColor = hslToRgb(h, Math.min(cs, 0.35), 0.78)

  return {
    '--accent-400': `${accent400.r} ${accent400.g} ${accent400.b}`,
    '--accent-500': `${accent500.r} ${accent500.g} ${accent500.b}`,
    '--accent-600': `${accent600.r} ${accent600.g} ${accent600.b}`,
    '--accent-700': `${accent700.r} ${accent700.g} ${accent700.b}`,
    '--accent-800': `${accent800.r} ${accent800.g} ${accent800.b}`,
    '--accent-900': `${accent900.r} ${accent900.g} ${accent900.b}`,
    '--accent-glow': `rgba(${accent600.r}, ${accent600.g}, ${accent600.b}, 0.22)`,
    '--accent-text': `#${toHex(textColor)}`,
    '--accent-border': `rgba(${accent500.r}, ${accent500.g}, ${accent500.b}, 0.28)`,
    '--orb-primary': `rgba(${accent900.r}, ${accent900.g}, ${accent900.b}, 0.18)`,
    '--orb-secondary': `rgba(${palette.secondary.r}, ${palette.secondary.g}, ${palette.secondary.b}, 0.14)`,
    '--orb-tertiary': `rgba(${palette.tertiary.r}, ${palette.tertiary.g}, ${palette.tertiary.b}, 0.10)`,
  }
}

/**
 * Interpolate between two palettes by a factor t (0..1).
 */
export function interpolatePalette(a: Palette, b: Palette, t: number): Palette {
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t)
  return {
    primary: { r: lerp(a.primary.r, b.primary.r), g: lerp(a.primary.g, b.primary.g), b: lerp(a.primary.b, b.primary.b) },
    secondary: { r: lerp(a.secondary.r, b.secondary.r), g: lerp(a.secondary.g, b.secondary.g), b: lerp(a.secondary.b, b.secondary.b) },
    tertiary: { r: lerp(a.tertiary.r, b.tertiary.r), g: lerp(a.tertiary.g, b.tertiary.g), b: lerp(a.tertiary.b, b.tertiary.b) },
  }
}

function toHex(c: RGB): string {
  return [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Parse a CSS color value to [r, g, b, a] numbers.
 */
function parseColor(value: string): [number, number, number, number] {
  const rgbParts = value.match(/^(\d+)\s+(\d+)\s+(\d+)$/)
  if (rgbParts) return [+rgbParts[1], +rgbParts[2], +rgbParts[3], 1]

  const rgba = value.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/)
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] !== undefined ? +rgba[4] : 1]

  const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 1]

  return [0, 0, 0, 1]
}

function formatColor(value: string, rgba: [number, number, number, number]): string {
  const [r, g, b, a] = rgba.map((v, i) => i < 3 ? Math.round(v) : v)
  if (value.match(/^\d+\s+\d+\s+\d+$/)) return `${r} ${g} ${b}`
  if (value.startsWith('rgba')) return `rgba(${r}, ${g}, ${b}, ${a})`
  if (value.startsWith('rgb(')) return `rgb(${r}, ${g}, ${b})`
  if (value.startsWith('#')) return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  return `${r} ${g} ${b}`
}

/**
 * Linearly interpolate between two theme color objects.
 */
export function interpolateThemeColors(from: ThemeColors, to: ThemeColors, t: number): ThemeColors {
  const result = {} as Record<string, string>
  for (const key of Object.keys(from) as (keyof ThemeColors)[]) {
    const fromRGBA = parseColor(from[key])
    const toRGBA = parseColor(to[key])
    const interpolated: [number, number, number, number] = [
      fromRGBA[0] + (toRGBA[0] - fromRGBA[0]) * t,
      fromRGBA[1] + (toRGBA[1] - fromRGBA[1]) * t,
      fromRGBA[2] + (toRGBA[2] - fromRGBA[2]) * t,
      fromRGBA[3] + (toRGBA[3] - fromRGBA[3]) * t,
    ]
    result[key] = formatColor(to[key], interpolated)
  }
  return result as ThemeColors
}
