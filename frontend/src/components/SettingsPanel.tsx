import { useState } from 'react'
import { useTheme } from '../lib/ThemeContext'
import { useVoice } from '../lib/VoiceContext'
import MicLevelMeter from './MicLevelMeter'
import { AUDIO_QUALITY_PRESETS, type AudioQualityPreset } from '../lib/VoiceManager'
import { Palette, SlidersHorizontal, Mic, Volume2, Keyboard } from 'lucide-react'

export default function SettingsPanel() {
  const { currentTheme, setThemeById, panelOpacity, setPanelOpacity, themes } = useTheme()
  const { voiceSettings, setVoiceSettings, inputDevices } = useVoice()
  const [rebindingPTT, setRebindingPTT] = useState(false)

  const handlePTTRebind = () => {
    setRebindingPTT(true)
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      setVoiceSettings({ pushToTalkKey: e.key })
      setRebindingPTT(false)
      window.removeEventListener('keydown', handler)
    }
    window.addEventListener('keydown', handler)
  }

  const formatKey = (key: string) => {
    if (key === ' ') return 'Space'
    if (key.length === 1) return key.toUpperCase()
    return key
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Voice Settings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-white/40" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Voice Chat
          </h3>
        </div>
        <div className="space-y-4">
          {/* Microphone Selection */}
          <div>
            <label className="text-[11px] text-white/30 font-medium mb-1.5 block">Microphone</label>
            <select
              value={voiceSettings.inputDevice}
              onChange={(e) => setVoiceSettings({ inputDevice: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-accent-500/30"
            >
              <option value="default">Default</option>
              {inputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Mic Volume */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-white/30 font-medium">Mic Volume</label>
              <span className="text-[10px] text-white/20">{voiceSettings.inputVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={voiceSettings.inputVolume}
              onChange={(e) => setVoiceSettings({ inputVolume: parseInt(e.target.value) })}
              className="w-full h-2"
            />
            {/* Mic sensitivity meter */}
            <div className="mt-2">
              <label className="text-[10px] text-white/20 font-medium mb-1 block">Mic Test</label>
              <MicLevelMeter variant="bar" />
            </div>
          </div>

          {/* Output Volume */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-3 h-3 text-white/30" />
                <label className="text-[11px] text-white/30 font-medium">Output Volume</label>
              </div>
              <span className="text-[10px] text-white/20">{voiceSettings.outputVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={voiceSettings.outputVolume}
              onChange={(e) => setVoiceSettings({ outputVolume: parseInt(e.target.value) })}
              className="w-full h-2"
            />
          </div>

          {/* Voice Quality */}
          <div>
            <label className="text-[11px] text-white/30 font-medium mb-1.5 block">Voice Quality</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(AUDIO_QUALITY_PRESETS) as AudioQualityPreset[]).map((key) => {
                const preset = AUDIO_QUALITY_PRESETS[key]
                const isActive = voiceSettings.audioQuality === key
                return (
                  <button
                    key={key}
                    onClick={() => setVoiceSettings({ audioQuality: key })}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      isActive
                        ? 'bg-accent-500/15 border-accent-500/30 text-accent-400'
                        : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:bg-white/[0.06] hover:border-white/[0.1]'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] text-white/15 mt-1">
              {AUDIO_QUALITY_PRESETS[voiceSettings.audioQuality].bitrate / 1000}kbps
              {voiceSettings.audioQuality === 'ultra' ? ' stereo' : ' mono'}
            </p>
          </div>

          {/* Noise Suppression */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-white/30 font-medium">Noise Suppression</label>
            <button
              onClick={() => setVoiceSettings({ noiseSuppression: !voiceSettings.noiseSuppression })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                voiceSettings.noiseSuppression ? 'bg-accent-500' : 'bg-white/[0.1]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  voiceSettings.noiseSuppression ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* AI Noise Suppression */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[11px] text-white/30 font-medium">AI Noise Suppression</label>
              <p className="text-[9px] text-white/15">ML-powered (like Discord Krisp)</p>
            </div>
            <button
              onClick={() => setVoiceSettings({ advancedNoiseSuppression: !voiceSettings.advancedNoiseSuppression })}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                voiceSettings.advancedNoiseSuppression ? 'bg-accent-500' : 'bg-white/[0.1]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  voiceSettings.advancedNoiseSuppression ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Push to Talk */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-white/30 font-medium">Push to Talk</label>
            <button
              onClick={() => setVoiceSettings({ pushToTalk: !voiceSettings.pushToTalk })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                voiceSettings.pushToTalk ? 'bg-accent-500' : 'bg-white/[0.1]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  voiceSettings.pushToTalk ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* PTT Key Binding */}
          {voiceSettings.pushToTalk && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Keyboard className="w-3 h-3 text-white/30" />
                <label className="text-[11px] text-white/30 font-medium">Push to Talk Key</label>
              </div>
              <button
                onClick={handlePTTRebind}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono transition-all ${
                  rebindingPTT
                    ? 'bg-accent-500/10 border-accent-500/30 text-accent-500 animate-pulse'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:border-white/[0.15]'
                }`}
              >
                {rebindingPTT ? 'Press any key...' : formatKey(voiceSettings.pushToTalkKey)}
              </button>
            </div>
          )}
        </div>
      </div>

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
