import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { socket } from '../lib/socket'
import type { User, ChatMessage, VideoState, RoomState } from '../lib/types'
import VideoPlayer from '../components/VideoPlayer'
import Chat from '../components/Chat'
import UserList from '../components/UserList'
import RoomHeader from '../components/RoomHeader'
import VideoUrlInput from '../components/VideoUrlInput'
import { MessageSquare, Users, X } from 'lucide-react'

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()

  const [users, setUsers] = useState<User[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [videoState, setVideoState] = useState<VideoState>({
    videoId: '',
    videoUrl: '',
    isPlaying: false,
    currentTime: 0,
    playbackRate: 1,
    timestamp: Date.now(),
  })
  const [hostId, setHostId] = useState('')
  const [connected, setConnected] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [showUsers, setShowUsers] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const myUserId = useRef(localStorage.getItem('wp_userId') || '')
  const isHost = hostId === socket.id

  const handleRoomState = useCallback((state: RoomState) => {
    setUsers(state.users)
    setHostId(state.hostId)
    setVideoState(state.videoState)
    setMessages(state.messages)
    setConnected(true)
  }, [])

  useEffect(() => {
    if (!socket.connected) {
      const storedName = localStorage.getItem('wp_username')
      if (!storedName) {
        navigate('/')
        return
      }

      socket.once('connect', () => {
        socket.emit('room:join', { roomId: roomId!, userName: storedName }, (response: { success: boolean; error?: string; userId?: string }) => {
          if (!response.success) {
            navigate('/')
          } else {
            myUserId.current = response.userId || ''
            localStorage.setItem('wp_userId', myUserId.current)
          }
        })
      })

      socket.connect()
    }

    socket.on('room:state', handleRoomState)

    socket.on('room:user-joined', ({ user }) => {
      setUsers((prev) => [...prev.filter((u) => u.id !== user.id), user])
    })

    socket.on('room:user-left', ({ userId }) => {
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    })

    socket.on('room:host-changed', ({ hostId: newHostId }) => {
      setHostId(newHostId)
    })

    socket.on('video:state-update', (state) => {
      setVideoState(state)
    })

    socket.on('video:load', ({ videoId, videoUrl }) => {
      setVideoState((prev) => ({
        ...prev,
        videoId,
        videoUrl,
        isPlaying: false,
        currentTime: 0,
      }))
    })

    socket.on('chat:message', (message) => {
      setMessages((prev) => [...prev, message])
      if (!showChat) {
        setUnreadCount((c) => c + 1)
      }
    })

    socket.on('error', ({ message }) => {
      console.error('Server error:', message)
    })

    return () => {
      socket.off('room:state')
      socket.off('room:user-joined')
      socket.off('room:user-left')
      socket.off('room:host-changed')
      socket.off('video:state-update')
      socket.off('video:load')
      socket.off('chat:message')
      socket.off('error')
    }
  }, [roomId, navigate, handleRoomState, showChat])

  const handleLeave = () => {
    socket.emit('room:leave')
    socket.disconnect()
    navigate('/')
  }

  const handleLoadVideo = (url: string) => {
    socket.emit('video:load', { url })
  }

  const handlePlay = (currentTime: number) => {
    socket.emit('video:play', { currentTime })
  }

  const handlePause = (currentTime: number) => {
    socket.emit('video:pause', { currentTime })
  }

  const handleSeek = (currentTime: number) => {
    socket.emit('video:seek', { currentTime })
  }

  const handleSendMessage = (text: string) => {
    socket.emit('chat:message', { text })
  }

  const toggleChat = () => {
    setShowChat(!showChat)
    if (!showChat) setUnreadCount(0)
    setShowUsers(false)
  }

  const toggleUsers = () => {
    setShowUsers(!showUsers)
    setShowChat(false)
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a14]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Connecting to room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] overflow-hidden">
      <RoomHeader
        roomId={roomId!}
        isHost={isHost}
        userCount={users.length}
        onLeave={handleLeave}
      />

      <div className="flex-1 flex min-h-0">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video URL Input (host only) */}
          {isHost && (
            <VideoUrlInput onLoadVideo={handleLoadVideo} />
          )}

          {/* Video Player */}
          <div className="flex-1 relative bg-black/40">
            {videoState.videoId ? (
              <VideoPlayer
                videoState={videoState}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                <svg className="w-20 h-20 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <p className="text-lg font-medium">No video loaded</p>
                <p className="text-sm mt-1 text-white/10">
                  {isHost ? 'Paste a YouTube URL above to get started' : 'Waiting for the host to load a video...'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:flex flex-col w-[380px] border-l border-white/[0.06] bg-white/[0.01]">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-white/[0.06]">
            <button
              onClick={() => { setShowChat(true); setShowUsers(false); setUnreadCount(0) }}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                showChat ? 'text-red-400 border-b-2 border-red-500' : 'text-white/30 hover:text-white/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
              {unreadCount > 0 && !showChat && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setShowUsers(true); setShowChat(false) }}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                showUsers ? 'text-red-400 border-b-2 border-red-500' : 'text-white/30 hover:text-white/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              People ({users.length})
            </button>
          </div>

          {showChat && (
            <Chat
              messages={messages}
              onSendMessage={handleSendMessage}
              currentUserId={socket.id || ''}
            />
          )}
          {showUsers && (
            <UserList users={users} hostId={hostId} currentUserId={socket.id || ''} />
          )}
        </div>

        {/* Mobile sidebar overlay */}
        {(showChat || showUsers) && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowChat(false); setShowUsers(false) }} />
            <div className="relative ml-auto w-full max-w-sm bg-[#0f0f1a] border-l border-white/[0.06] flex flex-col animate-slide-up">
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                  {showChat ? 'Chat' : `People (${users.length})`}
                </span>
                <button onClick={() => { setShowChat(false); setShowUsers(false) }} className="text-white/30 hover:text-white/60">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {showChat && (
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUserId={socket.id || ''} />
              )}
              {showUsers && (
                <UserList users={users} hostId={hostId} currentUserId={socket.id || ''} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden flex border-t border-white/[0.06] bg-white/[0.02]">
        <button
          onClick={toggleChat}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
            showChat ? 'text-red-400' : 'text-white/30'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
          {unreadCount > 0 && (
            <span className="absolute top-2 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={toggleUsers}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            showUsers ? 'text-red-400' : 'text-white/30'
          }`}
        >
          <Users className="w-4 h-4" />
          People ({users.length})
        </button>
      </div>
    </div>
  )
}
