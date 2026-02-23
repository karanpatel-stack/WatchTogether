import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket } from '../lib/socket'
import { Play, Users, Tv, UserPlus } from 'lucide-react'

const SG1_NAMES = [
  "O'Neill", "Carter", "Jackson", "Teal'c", "Hammond",
  "Fraiser", "Jonas", "Vala", "Landry", "Mitchell",
  "Apophis", "Ba'al", "Anubis", "Nirrti", "Bra'tac",
  "Martouf", "Thor", "Jacob", "Cassandra", "Siler",
]
const getRandomSG1Name = () => SG1_NAMES[Math.floor(Math.random() * SG1_NAMES.length)]

interface LobbyRoom {
  id: string
  userCount: number
  users: string[]
  videoTitle: string
  videoUrl: string
}

interface LobbyResponse {
  enabled: boolean
  rooms?: LobbyRoom[]
}

export default function Home() {
  const [userName, setUserName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoom[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/rooms')
        const data: LobbyResponse = await res.json()
        if (!cancelled && data.enabled && data.rooms) {
          setLobbyRooms(data.rooms)
        }
      } catch {
        // silently ignore — lobby is optional
      }
    }

    fetchRooms()
    const interval = setInterval(fetchRooms, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const connect = () => {
    if (!socket.connected) {
      socket.connect()
    }
  }

  const handleCreate = () => {
    const name = userName.trim() || getRandomSG1Name()
    if (!userName.trim()) setUserName(name)
    setError('')
    setIsCreating(true)
    connect()

    socket.emit('room:create', { userName: name }, (response: { roomId: string; userId: string }) => {
      setIsCreating(false)
      localStorage.setItem('wp_username', name)
      localStorage.setItem('wp_userId', response.userId)
      navigate(`/room/${response.roomId}`)
    })
  }

  const handleJoin = (overrideCode?: string) => {
    const code = (overrideCode ?? roomCode).trim().toUpperCase()
    if (!code) {
      setError('Please enter a room code')
      return
    }
    const name = userName.trim() || getRandomSG1Name()
    if (!userName.trim()) setUserName(name)
    setError('')
    setIsJoining(true)
    connect()

    socket.emit('room:join', { roomId: code, userName: name }, (response: { success: boolean; error?: string; userId?: string }) => {
      setIsJoining(false)
      if (response.success) {
        localStorage.setItem('wp_username', name)
        localStorage.setItem('wp_userId', response.userId || '')
        navigate(`/room/${code}`)
      } else {
        setError(response.error || 'Failed to join room')
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent, action: 'create' | 'join') => {
    if (e.key === 'Enter') {
      if (action === 'create') handleCreate()
      else handleJoin()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[#0a0a14]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px] pointer-events-none" style={{ background: 'var(--orb-primary)' }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-[120px] pointer-events-none" style={{ background: 'var(--orb-secondary)' }} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] blur-[100px] pointer-events-none" style={{ background: 'var(--orb-primary)' }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600/20 border border-accent-500/10 mb-5 shadow-glow-accent-sm">
            <Tv className="w-8 h-8 text-accent-500" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">
            WATCH<span className="text-accent-500">PARTY</span>
          </h1>
          <p className="text-sm font-medium tracking-[0.25em] uppercase text-white/30">
            Watch Together, Anywhere
          </p>
        </div>

        {/* Create Room Card */}
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 mb-4 shadow-inner-light">
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'create')}
            placeholder="Leave blank for random name..."
            maxLength={20}
            className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-xl px-4 py-3.5 text-white placeholder-white/20 text-sm font-medium transition-all duration-200 focus:border-accent-500/40 focus:bg-white/[0.06] focus:shadow-glow-accent-sm hover:border-white/[0.12]"
          />

          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full mt-4 bg-gradient-to-r from-accent-700 to-accent-600 hover:from-accent-600 hover:to-accent-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-accent-900/30 hover:shadow-accent-800/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Play className="w-4 h-4" />
                Create Room
              </>
            )}
          </button>

          <button
            className="w-full mt-3 bg-accent-600/10 hover:bg-accent-600/20 border border-accent-500/20 hover:border-accent-500/35 text-accent-400 font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-accent-900/10 hover:shadow-accent-800/20 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-5">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <span className="text-xs font-medium text-white/20 uppercase tracking-wider">or join</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>

        {/* Join Room Card */}
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 shadow-inner-light">
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
            Room Code
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => handleKeyDown(e, 'join')}
              placeholder="XXXXXX"
              maxLength={6}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-xl px-4 py-3.5 text-white placeholder-white/20 text-sm font-mono font-semibold tracking-[0.2em] text-center transition-all duration-200 focus:border-accent-500/40 focus:bg-white/[0.06] focus:shadow-glow-accent-sm hover:border-white/[0.12] uppercase"
            />
            <button
              onClick={() => handleJoin()}
              disabled={isJoining}
              className="px-6 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.15] text-white font-semibold py-3.5 rounded-xl transition-all duration-200 flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isJoining ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Join
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active Rooms Lobby (dev only) */}
        {lobbyRooms && lobbyRooms.length > 0 && (
          <div className="mt-5 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Active Rooms</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/20 text-amber-400/70 uppercase tracking-wider">dev</span>
            </div>
            <div className="flex flex-col gap-2">
              {lobbyRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors"
                >
                  <span className="font-mono text-xs font-semibold text-white/60 tracking-[0.15em] w-16 shrink-0">{room.id}</span>
                  <div className="flex items-center gap-1 text-white/30 shrink-0">
                    <Users className="w-3 h-3" />
                    <span className="text-xs">{room.userCount}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/40 truncate">{room.users.join(', ')}</p>
                    {room.videoUrl && (
                      <p className="text-[10px] text-white/20 truncate mt-0.5">{room.videoTitle || room.videoUrl}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setRoomCode(room.id)
                      handleJoin(room.id)
                    }}
                    className="shrink-0 px-3 py-1 rounded-lg bg-accent-600/15 border border-accent-500/20 text-accent-400 text-xs font-medium hover:bg-accent-600/25 transition-colors"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-accent-500/10 border border-accent-500/20 rounded-xl px-4 py-3 text-[var(--accent-text)] text-sm text-center animate-slide-up">
            {error}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-white/15 mt-8 leading-relaxed">
          Paste a YouTube link and watch in perfect sync with friends.
          <br />
          No Accounts Needed. Rooms expire when empty.
        </p>
      </div>
    </div>
  )
}
