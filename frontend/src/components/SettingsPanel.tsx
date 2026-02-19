import { useTheme } from '../lib/ThemeContext'
import { Palette, SlidersHorizontal } from 'lucide-react'

export default function SettingsPanel() {
  const { currentTheme, setThemeById, panelOpacity, setPanelOpacity, themes } = useTheme()

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Panel Opacity */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="w-4 h-4 text-white/40" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Panel Opacity
          </h3>
        </div>
        <div className="space-y-2">
          <input
            type="range"
            min="0"
            max="0.20"
            step="0.01"
            value={panelOpacity}
            onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
            className="w-full h-2"
          />
          <div className="flex justify-between text-[10px] text-white/20">
            <span>Transparent</span>
            <span>{Math.round(panelOpacity * 100)}%</span>
            <span>Opaque</span>
          </div>
        </div>
      </div>

      {/* Theme Selector */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-white/40" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Color Theme
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((theme) => {
            const isActive = currentTheme.id === theme.id
            const rgb = theme.colors['--accent-500']
            return (
              <button
                key={theme.id}
                onClick={() => setThemeById(theme.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left ${
                  isActive
                    ? 'bg-white/[0.08] border-white/[0.15]'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 shadow-lg"
                  style={{ background: `rgb(${rgb})` }}
                />
                <span className={`text-xs font-medium truncate ${
                  isActive ? 'text-white' : 'text-white/50'
                }`}>
                  {theme.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
