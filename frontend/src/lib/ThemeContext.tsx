import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { themes, getThemeById, DEFAULT_THEME_ID, DEFAULT_PANEL_OPACITY, type Theme } from './themes'

interface ThemeContextValue {
  currentTheme: Theme
  setThemeById: (id: string) => void
  panelOpacity: number
  setPanelOpacity: (opacity: number) => void
  themes: Theme[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('wp_theme')
    return getThemeById(stored || DEFAULT_THEME_ID)
  })

  const [panelOpacity, setPanelOpacityState] = useState<number>(() => {
    const stored = localStorage.getItem('wp_panel_opacity')
    return stored ? parseFloat(stored) : DEFAULT_PANEL_OPACITY
  })

  const setThemeById = (id: string) => {
    const theme = getThemeById(id)
    setCurrentTheme(theme)
    localStorage.setItem('wp_theme', id)
  }

  const setPanelOpacity = (opacity: number) => {
    setPanelOpacityState(opacity)
    localStorage.setItem('wp_panel_opacity', String(opacity))
  }

  useEffect(() => {
    const root = document.documentElement.style
    for (const [key, value] of Object.entries(currentTheme.colors)) {
      root.setProperty(key, value)
    }
    root.setProperty('--panel-opacity', String(panelOpacity))
  }, [currentTheme, panelOpacity])

  return (
    <ThemeContext.Provider value={{ currentTheme, setThemeById, panelOpacity, setPanelOpacity, themes }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
