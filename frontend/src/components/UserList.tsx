import { Crown, Mic, MicOff } from 'lucide-react'
import { useVoice } from '../lib/VoiceContext'
import type { User } from '../lib/types'

interface Props {
  users: User[]
  hostId: string
  currentUserId: string
}

export default function UserList({ users, hostId, currentUserId }: Props) {
  const { speakingUsers, voiceUsers, isInVoice, isMuted } = useVoice()

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-1">
        {users.map((user) => {
          const isSpeaking = speakingUsers.has(user.id)
          const isCurrentUserMuted = user.id === currentUserId && isMuted
          const isUserInVoice = user.id === currentUserId ? isInVoice : voiceUsers.has(user.id)

          return (
            <div
              key={user.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                user.id === currentUserId
                  ? 'bg-accent-500/[0.06] border border-accent-500/10'
                  : 'hover:bg-white/[0.02]'
              }`}
            >
              <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border flex items-center justify-center text-lg transition-all ${
                isSpeaking
                  ? 'border-green-400/40 shadow-[0_0_12px_rgba(74,222,128,0.3)]'
                  : 'border-white/[0.06]'
              }`}>
                {user.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium truncate ${
                    user.id === currentUserId ? 'text-white' : 'text-white/70'
                  }`}>
                    {user.name}
                  </span>
                  {user.id === currentUserId && (
                    <span className="text-[10px] font-medium text-white/20">(you)</span>
                  )}
                </div>
                {user.id === hostId && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Crown className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Host</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isUserInVoice && (
                  isCurrentUserMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-red-400/60" />
                  ) : (
                    <Mic className={`w-3.5 h-3.5 transition-colors ${
                      isSpeaking ? 'text-green-400' : 'text-white/20'
                    }`} />
                  )
                )}
                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
