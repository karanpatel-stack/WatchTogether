import { Crown } from 'lucide-react'
import type { User } from '../lib/types'

interface Props {
  users: User[]
  hostId: string
  currentUserId: string
}

export default function UserList({ users, hostId, currentUserId }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-1">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
              user.id === currentUserId
                ? 'bg-accent-500/[0.06] border border-accent-500/10'
                : 'hover:bg-white/[0.02]'
            }`}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-lg">
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
            <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
