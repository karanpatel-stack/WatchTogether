import { useState } from 'react'
import { Tv, Copy, Check, LogOut, Crown, Users, Mic, MicOff, Film, Phone, PhoneOff, Monitor, EyeOff, Eye } from 'lucide-react'
import { useVoice } from '../lib/VoiceContext'
import { useScreenShare } from '../lib/ScreenShareContext'
import MicLevelMeter from './MicLevelMeter'

interface Props {
  roomId: string
  isHost: boolean
  userCount: number
  onLeave: () => void
  livingRoomMode: boolean
  onToggleLivingRoom: () => void
  dimLevel: number
  isHidden: boolean
  onToggleHidden: () => void
}

export default function RoomHeader({ roomId, isHost, userCount, onLeave, livingRoomMode, onToggleLivingRoom, dimLevel, isHidden, onToggleHidden }: Props) {
  const [copied, setCopied] = useState(false)
  const { isMuted, isInVoice, toggleMute, joinVoice, leaveVoice, speakingUsers, voiceSettings } = useVoice()
  const { isSharing, isViewing, startSharing, stopSharing } = useScreenShare()

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header
      className={`flex items-center justify-between px-4 py-3 border-b shadow-[0_1px_20px_rgba(0,0,0,0.3)] transition-[background,border-color] duration-300 ${
        livingRoomMode ? 'border-[#2a1508]/60' : 'border-panel bg-panel backdrop-blur-xl'
      }`}
      style={livingRoomMode ? {
        background: `linear-gradient(90deg,
          rgba(30,16,8,${0.95 + dimLevel * 0.05}) 0%,
          rgba(19,10,4,${0.95 + dimLevel * 0.05}) 100%)`,
        boxShadow: `0 1px 20px rgba(0,0,0,${0.3 + dimLevel * 0.4})`,
      } : undefined}
    >
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

        {isInVoice ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <button
              onClick={toggleMute}
              disabled={voiceSettings.pushToTalk}
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
                isMuted
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              } ${voiceSettings.pushToTalk ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={voiceSettings.pushToTalk ? 'Push to Talk enabled' : isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            <MicLevelMeter variant="dots" />

            {speakingUsers.size > 0 && (
              <div className="hidden sm:flex items-center gap-1 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
                <span className="text-[10px] text-green-400/80 font-medium">{speakingUsers.size}</span>
              </div>
            )}

            {voiceSettings.pushToTalk && (
              <span className="hidden sm:inline text-[9px] text-white/25 font-medium">
                PTT: {voiceSettings.pushToTalkKey === ' ' ? 'Space' : voiceSettings.pushToTalkKey.toUpperCase()}
              </span>
            )}

            <button
              onClick={leaveVoice}
              className="flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.04] text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Disconnect from voice"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={joinVoice}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-500/15 border border-accent-500/25 text-[var(--accent-text)] hover:bg-accent-500/25 hover:border-accent-500/35 transition-all text-xs font-medium"
            title="Join voice chat"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Join Voice</span>
          </button>
        )}

        {isSharing ? (
          <button
            onClick={stopSharing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 transition-all text-xs font-medium"
            title="Stop sharing your screen"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Stop Sharing</span>
          </button>
        ) : isViewing ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-500/15 border border-accent-500/25 text-[var(--accent-text)] text-xs font-medium">
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Screen Share Active</span>
          </div>
        ) : (
          <button
            onClick={startSharing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] hover:border-white/[0.1] transition-all text-xs font-medium"
            title="Share your screen"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share Screen</span>
          </button>
        )}

        <button
          onClick={onToggleHidden}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-xs font-medium ${
            isHidden
              ? 'bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25'
              : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] hover:border-white/[0.1]'
          }`}
          title={isHidden ? 'Room is hidden from lobby' : 'Room is visible in lobby'}
        >
          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">HideRoom</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-[9px] font-mono text-white/15 select-all" title="Build version">
          {__COMMIT_HASH__}
        </span>

        <button
          onClick={onToggleLivingRoom}
          title={livingRoomMode ? 'Exit Theatre mode' : 'Theatre mode'}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${
            livingRoomMode
              ? 'bg-accent-500/20 border-accent-500/30 text-[var(--accent-text)]'
              : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:border-white/[0.1] hover:text-white/60'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Theatre</span>
        </button>

        <div className="hidden sm:flex items-center gap-1.5 text-white/30">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{userCount}</span>
        </div>

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
