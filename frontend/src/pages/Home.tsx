import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket } from '../lib/socket'
import { Play, Users, Tv, UserPlus } from 'lucide-react'

export default function Home() {
  const [userName, setUserName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const connect = () => {
    if (!socket.connected) {
      socket.connect()
    }
  }

  const handleCreate = () => {
    if (!userName.trim()) {
      setError('Please enter a display name')
      return
    }
    setError('')
    setIsCreating(true)
    connect()

    socket.emit('room:create', { userName: userName.trim() }, (response: { roomId: string; userId: string }) => {
      setIsCreating(false)
      localStorage.setItem('wp_username', userName.trim())
      localStorage.setItem('wp_userId', response.userId)
      navigate(`/room/${response.roomId}`)
    })
  }

  const handleJoin = () => {
    if (!userName.trim()) {
      setError('Please enter a display name')
      return
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code')
      return
    }
    setError('')
    setIsJoining(true)
    connect()

    socket.emit('room:join', { roomId: roomCode.trim().toUpperCase(), userName: userName.trim() }, (response: { success: boolean; error?: string; userId?: string }) => {
      setIsJoining(false)
      if (response.success) {
        localStorage.setItem('wp_username', userName.trim())
        localStorage.setItem('wp_userId', response.userId || '')
        navigate(`/room/${roomCode.trim().toUpperCase()}`)
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
            placeholder="Enter display name..."
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
              onClick={handleJoin}
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
