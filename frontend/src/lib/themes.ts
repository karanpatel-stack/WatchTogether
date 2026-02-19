export interface Theme {
  id: string
  name: string
  colors: {
    // RGB channels (e.g. "239 68 68") for Tailwind opacity support
    '--accent-400': string
    '--accent-500': string
    '--accent-600': string
    '--accent-700': string
    '--accent-800': string
    '--accent-900': string
    // Full color values
    '--accent-glow': string
    '--accent-text': string
    '--accent-border': string
    '--orb-primary': string
    '--orb-secondary': string
    '--orb-tertiary': string
  }
}

export const themes: Theme[] = [
  {
    id: 'crimson',
    name: 'Crimson',
    colors: {
      '--accent-400': '248 113 113',
      '--accent-500': '239 68 68',
      '--accent-600': '220 38 38',
      '--accent-700': '185 28 28',
      '--accent-800': '153 27 27',
      '--accent-900': '127 29 29',
      '--accent-glow': 'rgba(220, 38, 38, 0.15)',
      '--accent-text': '#f87171',
      '--accent-border': 'rgba(239, 68, 68, 0.25)',
      '--orb-primary': 'rgba(127, 29, 29, 0.08)',
      '--orb-secondary': 'rgba(153, 27, 27, 0.06)',
      '--orb-tertiary': 'rgba(88, 28, 135, 0.05)',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    colors: {
      '--accent-400': '96 165 250',
      '--accent-500': '59 130 246',
      '--accent-600': '37 99 235',
      '--accent-700': '29 78 216',
      '--accent-800': '30 64 175',
      '--accent-900': '30 58 138',
      '--accent-glow': 'rgba(37, 99, 235, 0.15)',
      '--accent-text': '#60a5fa',
      '--accent-border': 'rgba(59, 130, 246, 0.25)',
      '--orb-primary': 'rgba(30, 58, 138, 0.08)',
      '--orb-secondary': 'rgba(30, 64, 175, 0.06)',
      '--orb-tertiary': 'rgba(17, 94, 89, 0.05)',
    },
  },
  {
    id: 'neon-purple',
    name: 'Neon Purple',
    colors: {
      '--accent-400': '192 132 252',
      '--accent-500': '168 85 247',
      '--accent-600': '147 51 234',
      '--accent-700': '126 34 206',
      '--accent-800': '107 33 168',
      '--accent-900': '88 28 135',
      '--accent-glow': 'rgba(147, 51, 234, 0.15)',
      '--accent-text': '#c084fc',
      '--accent-border': 'rgba(168, 85, 247, 0.25)',
      '--orb-primary': 'rgba(88, 28, 135, 0.08)',
      '--orb-secondary': 'rgba(107, 33, 168, 0.06)',
      '--orb-tertiary': 'rgba(30, 58, 138, 0.05)',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    colors: {
      '--accent-400': '52 211 153',
      '--accent-500': '16 185 129',
      '--accent-600': '5 150 105',
      '--accent-700': '4 120 87',
      '--accent-800': '6 95 70',
      '--accent-900': '6 78 59',
      '--accent-glow': 'rgba(5, 150, 105, 0.15)',
      '--accent-text': '#34d399',
      '--accent-border': 'rgba(16, 185, 129, 0.25)',
      '--orb-primary': 'rgba(6, 78, 59, 0.08)',
      '--orb-secondary': 'rgba(6, 95, 70, 0.06)',
      '--orb-tertiary': 'rgba(30, 58, 138, 0.05)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Orange',
    colors: {
      '--accent-400': '251 146 60',
      '--accent-500': '249 115 22',
      '--accent-600': '234 88 12',
      '--accent-700': '194 65 12',
      '--accent-800': '154 52 18',
      '--accent-900': '124 45 18',
      '--accent-glow': 'rgba(234, 88, 12, 0.15)',
      '--accent-text': '#fb923c',
      '--accent-border': 'rgba(249, 115, 22, 0.25)',
      '--orb-primary': 'rgba(124, 45, 18, 0.08)',
      '--orb-secondary': 'rgba(154, 52, 18, 0.06)',
      '--orb-tertiary': 'rgba(127, 29, 29, 0.05)',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      '--accent-400': '148 163 184',
      '--accent-500': '100 116 139',
      '--accent-600': '71 85 105',
      '--accent-700': '51 65 85',
      '--accent-800': '30 41 59',
      '--accent-900': '15 23 42',
      '--accent-glow': 'rgba(71, 85, 105, 0.15)',
      '--accent-text': '#94a3b8',
      '--accent-border': 'rgba(100, 116, 139, 0.25)',
      '--orb-primary': 'rgba(15, 23, 42, 0.08)',
      '--orb-secondary': 'rgba(30, 41, 59, 0.06)',
      '--orb-tertiary': 'rgba(30, 27, 75, 0.05)',
    },
  },
]

export const DEFAULT_THEME_ID = 'crimson'
export const DEFAULT_PANEL_OPACITY = 0.07

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || themes[0]
}
