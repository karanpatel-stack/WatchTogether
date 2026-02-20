import { useState } from 'react'
import { Tv, Copy, Check, LogOut, Crown, Users, Mic, MicOff } from 'lucide-react'
import { useVoice } from '../lib/VoiceContext'

interface Props {
  roomId: string
  isHost: boolean
  userCount: number
  onLeave: () => void
}

export default function RoomHeader({ roomId, isHost, userCount, onLeave }: Props) {
  const [copied, setCopied] = useState(false)
  const { isMuted, isInVoice, toggleMute, voiceSettings } = useVoice()

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-panel bg-panel backdrop-blur-xl shadow-[0_1px_20px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-600/20 border border-accent-500/10 flex items-center justify-center">
            <Tv className="w-4 h-4 text-accent-500" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">
            WATCH<span className="text-accent-500">PARTY</span>
          </span>
        </div>

        <div className="h-5 w-px bg-white/[0.08]" />

        <button
          onClick={copyRoomCode}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all group"
        >
          <span className="text-xs font-mono font-semibold text-white/50 tracking-[0.15em]">{roomId}</span>
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
          )}
        </button>

        {isHost && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
            <Crown className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Host</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-white/30">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{userCount}</span>
        </div>

        {isInVoice && (
          <button
            onClick={toggleMute}
            disabled={voiceSettings.pushToTalk}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
              isMuted
                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                : 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
            } ${voiceSettings.pushToTalk ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={voiceSettings.pushToTalk ? 'Push to Talk enabled' : isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
        )}

        <button
          onClick={onLeave}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/40 hover:text-[var(--accent-text)] hover:bg-accent-500/10 border border-transparent hover:border-accent-500/20 transition-all text-xs font-medium"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </header>
  )
}
