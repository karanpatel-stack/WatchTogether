import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { socket } from '../lib/socket'
import type { User, ChatMessage, VideoState, RoomState, QueueItem } from '../lib/types'
import VideoPlayer from '../components/VideoPlayer'
import Chat from '../components/Chat'
import UserList from '../components/UserList'
import RoomHeader from '../components/RoomHeader'
import VideoUrlInput from '../components/VideoUrlInput'
import QueuePanel from '../components/QueuePanel'
import CommentsPanel from '../components/CommentsPanel'
import SettingsPanel from '../components/SettingsPanel'
import { MessageSquare, Users, X, ListMusic, MessageCircle, Settings } from 'lucide-react'

type SidebarTab = 'chat' | 'people' | 'queue' | 'comments' | 'settings'

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
    seq: 0,
  })
  const [hostId, setHostId] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat')
  const [mobileTab, setMobileTab] = useState<SidebarTab | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const myUserId = useRef(localStorage.getItem('wp_userId') || '')
  const connectedRef = useRef(false)
  const joinedRef = useRef(false)
  const isHost = hostId === socket.id

  const handleRoomState = useCallback((state: RoomState) => {
    setUsers(state.users)
    setHostId(state.hostId)
    setVideoState(state.videoState)
    setMessages(state.messages)
    setQueue(state.queue)
    setConnected(true)
    connectedRef.current = true
  }, [])

  useEffect(() => {
    const storedName = localStorage.getItem('wp_username')
    if (!storedName) {
      navigate('/')
      return
    }

    let retryCount = 0
    const MAX_RETRIES = 3
    joinedRef.current = false

    const joinRoom = () => {
      if (joinedRef.current) return
      joinedRef.current = true
      socket.emit('room:join', { roomId: roomId!, userName: storedName }, (response: { success: boolean; error?: string; userId?: string }) => {
        if (!response.success) {
          joinedRef.current = false
          navigate('/')
        } else {
          myUserId.current = response.userId || ''
          localStorage.setItem('wp_userId', myUserId.current)
        }
      })
    }

    const handleConnect = () => {
      retryCount = 0
      joinRoom()
    }

    const handleConnectError = () => {
      retryCount++
      if (retryCount >= MAX_RETRIES) {
        socket.disconnect()
        navigate('/')
      }
    }

    // If already connected (navigated from Home.tsx), join immediately
    if (socket.connected) {
      joinRoom()
    } else {
      socket.connect()
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)

    // Overall timeout - if not connected within 15s, bail out
    const timeout = setTimeout(() => {
      if (!connectedRef.current) {
        socket.disconnect()
        navigate('/')
      }
    }, 15000)

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

    socket.on('queue:update', ({ queue: newQueue }: { queue: QueueItem[] }) => {
      setQueue(newQueue)
    })

    socket.on('chat:message', (message) => {
      setMessages((prev) => [...prev, message])
      setUnreadCount((c) => c + 1)
    })

    socket.on('error', ({ message }) => {
      console.error('Server error:', message)
    })

    return () => {
      clearTimeout(timeout)
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('room:state')
      socket.off('room:user-joined')
      socket.off('room:user-left')
      socket.off('room:host-changed')
      socket.off('video:state-update')
      socket.off('video:load')
      socket.off('queue:update')
      socket.off('chat:message')
      socket.off('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, navigate, handleRoomState])

  const handleLeave = () => {
    socket.emit('room:leave')
    socket.disconnect()
    navigate('/')
  }

  const handleLoadVideo = (url: string) => {
    socket.emit('video:load', { url })
  }

  const handleAddToQueue = (url: string) => {
    socket.emit('queue:add', { url }, (response: { success: boolean; error?: string }) => {
      if (!response.success) {
        console.error('Queue add failed:', response.error)
      }
    })
  }

  const handleQueueRemove = (itemId: string) => {
    socket.emit('queue:remove', { itemId })
  }

  const handleQueueReorder = (itemId: string, newIndex: number) => {
    socket.emit('queue:reorder', { itemId, newIndex })
  }

  const handleVideoEnded = () => {
    socket.emit('video:ended')
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

  const switchTab = (tab: SidebarTab) => {
    setActiveTab(tab)
    if (tab === 'chat') setUnreadCount(0)
  }

  const switchMobileTab = (tab: SidebarTab) => {
    if (mobileTab === tab) {
      setMobileTab(null)
    } else {
      setMobileTab(tab)
      if (tab === 'chat') setUnreadCount(0)
    }
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a14]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Connecting to room...</p>
        </div>
      </div>
    )
  }

  const tabButton = (tab: SidebarTab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => switchTab(tab)}
      className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
        activeTab === tab ? 'text-[var(--accent-text)] border-b-2 border-accent-500' : 'text-white/30 hover:text-white/50'
      }`}
    >
      {icon}
      {label}
      {badge && badge > 0 && activeTab !== tab ? (
        <span className="bg-accent-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  )

  const mobileTabButton = (tab: SidebarTab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => switchMobileTab(tab)}
      className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
        mobileTab === tab ? 'text-[var(--accent-text)]' : 'text-white/30'
      }`}
    >
      {icon}
      {label}
      {badge && badge > 0 ? (
        <span className="absolute top-2 right-1/4 bg-accent-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  )

  const renderTabContent = (isMobile = false) => {
    const tab = isMobile ? mobileTab : activeTab
    switch (tab) {
      case 'chat':
        return <Chat messages={messages} onSendMessage={handleSendMessage} currentUserId={socket.id || ''} />
      case 'people':
        return <UserList users={users} hostId={hostId} currentUserId={socket.id || ''} />
      case 'queue':
        return <QueuePanel queue={queue} onRemove={handleQueueRemove} onReorder={handleQueueReorder} />
      case 'comments':
        return <CommentsPanel videoId={videoState.videoId} />
      case 'settings':
        return <SettingsPanel />
      default:
        return null
    }
  }

  const getTabLabel = () => {
    switch (mobileTab) {
      case 'chat': return 'Chat'
      case 'people': return `People (${users.length})`
      case 'queue': return `Queue (${queue.length})`
      case 'comments': return 'Comments'
      case 'settings': return 'Settings'
      default: return ''
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] overflow-hidden relative">
      {/* Ambient gradient orbs for glassmorphism backdrop */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[180px] pointer-events-none" style={{ background: 'var(--orb-primary)' }} />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[150px] pointer-events-none" style={{ background: 'var(--orb-secondary)' }} />
      <div className="absolute top-1/2 right-1/3 w-[400px] h-[400px] rounded-full blur-[140px] pointer-events-none" style={{ background: 'var(--orb-tertiary)' }} />

      <RoomHeader
        roomId={roomId!}
        isHost={isHost}
        userCount={users.length}
        onLeave={handleLeave}
      />

      <div className="flex-1 flex min-h-0">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video URL Input */}
          <VideoUrlInput onLoadVideo={handleLoadVideo} onAddToQueue={handleAddToQueue} />

          {/* Video Player */}
          <div className="flex-1 relative bg-black/40">
            {videoState.videoId ? (
              <VideoPlayer
                videoState={videoState}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                onEnd={handleVideoEnded}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                <svg className="w-20 h-20 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <p className="text-lg font-medium">No video loaded</p>
                <p className="text-sm mt-1 text-white/10">
                  Paste a YouTube URL above to get started
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:flex flex-col w-[380px] border-l border-panel bg-panel backdrop-blur-xl shadow-[-4px_0_30px_rgba(0,0,0,0.3)]">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-panel">
            {tabButton('chat', 'Chat', <MessageSquare className="w-3.5 h-3.5" />, unreadCount)}
            {tabButton('people', `People (${users.length})`, <Users className="w-3.5 h-3.5" />)}
            {tabButton('queue', `Queue (${queue.length})`, <ListMusic className="w-3.5 h-3.5" />)}
            {tabButton('comments', 'Comments', <MessageCircle className="w-3.5 h-3.5" />)}
            {tabButton('settings', '', <Settings className="w-3.5 h-3.5" />)}
          </div>

          {renderTabContent()}
        </div>

        {/* Mobile sidebar overlay */}
        {mobileTab && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileTab(null)} />
            <div className="relative ml-auto w-full max-w-sm bg-panel backdrop-blur-xl border-l border-panel flex flex-col animate-slide-up shadow-[-4px_0_30px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between p-4 border-b border-panel">
                <span className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                  {getTabLabel()}
                </span>
                <button onClick={() => setMobileTab(null)} className="text-white/30 hover:text-white/60">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderTabContent(true)}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden flex border-t border-panel bg-panel backdrop-blur-xl shadow-[0_-1px_20px_rgba(0,0,0,0.3)]">
        {mobileTabButton('chat', 'Chat', <MessageSquare className="w-4 h-4" />, unreadCount)}
        {mobileTabButton('people', 'People', <Users className="w-4 h-4" />)}
        {mobileTabButton('queue', 'Queue', <ListMusic className="w-4 h-4" />)}
        {mobileTabButton('comments', 'Comments', <MessageCircle className="w-4 h-4" />)}
        {mobileTabButton('settings', 'Settings', <Settings className="w-4 h-4" />)}
      </div>
    </div>
  )
}
