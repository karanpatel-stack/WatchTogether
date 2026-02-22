import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { useVoice } from '../lib/VoiceContext'
import MicLevelMeter from './MicLevelMeter'

export default function VoiceControls() {
  const { isMuted, isInVoice, speakingUsers, toggleMute, leaveVoice, voiceSettings } = useVoice()

  const speakingCount = speakingUsers.size

  if (!isInVoice) return null

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        {/* Mute/Unmute */}
        <button
          onClick={toggleMute}
          disabled={voiceSettings.pushToTalk}
          className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
            isMuted
              ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
              : 'bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30'
          } ${voiceSettings.pushToTalk ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={voiceSettings.pushToTalk ? 'Push to Talk enabled' : isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
        </button>

        {/* Mic level indicator */}
        <MicLevelMeter variant="dots" />

        {/* Speaking indicator */}
        {speakingCount > 0 && (
          <div className="flex items-center gap-1.5 px-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
            <span className="text-[11px] text-green-400/80 font-medium">
              {speakingCount} speaking
            </span>
          </div>
        )}

        {/* PTT indicator */}
        {voiceSettings.pushToTalk && (
          <div className="text-[10px] text-white/30 font-medium px-1">
            PTT: {voiceSettings.pushToTalkKey === ' ' ? 'Space' : voiceSettings.pushToTalkKey.toUpperCase()}
          </div>
        )}

        {/* Disconnect */}
        <button
          onClick={leaveVoice}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
          title="Disconnect from voice"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
