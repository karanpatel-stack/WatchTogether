import { useRef, useEffect } from 'react'
import { Link, Users } from 'lucide-react'
import type { User, VideoState } from '../lib/types'
import VideoPlayer from './VideoPlayer'
import DirectVideoPlayer from './DirectVideoPlayer'
import ScreenSharePlayer from './ScreenSharePlayer'

const USER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
]

// Couch palette
const C_SEAT = '#5c3520'
const C_BACK = '#3d2010'
const C_ARM  = '#4a2a14'

// Single straight couch dimensions
const COUCH_W = 520
const COUCH_H = 86
const COUCH_BACK = 18   // back cushion strip height
const COUCH_ARM = 14    // armrest width

interface Props {
  users: User[]
  videoState: VideoState
  isSharing: boolean
  isViewing: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  onPlay: (t: number) => void
  onPause: (t: number) => void
  onSeek: (t: number) => void
  onEnd: () => void
  onToggleUrlInput: () => void
  urlInputOpen: boolean
  lobbyOpen: boolean
  onToggleLobby: () => void
  dimLevel: number
}

function Avatar({ user, color }: { user: User | null; color: string }) {
  if (!user) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '1px dashed rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        flexShrink: 0,
      }} />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%',
          backgroundColor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        }}
        title={user.name}
      >
        {user.name[0]?.toUpperCase() ?? '?'}
      </div>
      <span style={{
        fontSize: 8, color: 'rgba(255,255,255,0.4)',
        maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {user.name}
      </span>
    </div>
  )
}


export default function LivingRoomView({
  users, videoState, isSharing, isViewing, localStream, remoteStream,
  onPlay, onPause, onSeek, onEnd, onToggleUrlInput, urlInputOpen, lobbyOpen, onToggleLobby, dimLevel,
}: Props) {
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = previewRef.current
    if (!v) return
    v.srcObject = isSharing && localStream ? localStream : null
  }, [isSharing, localStream])

  // Assign users to seats 0-7 left to right
  const s = Array.from({ length: 8 }, (_, i) => users[i] ?? null)

  const isOn = !!(videoState.videoId || videoState.videoUrl || isViewing || isSharing)

  const renderVideo = () => {
    if (isViewing && remoteStream) return <ScreenSharePlayer stream={remoteStream} />
    if (isSharing) return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>You are sharing your screen</span>
      </div>
    )
    if (videoState.videoType === 'direct' && videoState.videoUrl) {
      return <DirectVideoPlayer videoState={videoState} onPlay={onPlay} onPause={onPause} onSeek={onSeek} onEnd={onEnd} />
    }
    if (videoState.videoId) {
      return <VideoPlayer videoState={videoState} onPlay={onPlay} onPause={onPause} onSeek={onSeek} onEnd={onEnd} />
    }
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 11 }}>No video loaded</span>
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0c0704', userSelect: 'none' }}>

      {/* === ROOM BACKGROUND === */}
      {/* Wall */}
      <div style={{ position: 'absolute', inset: '0 0 52% 0', background: 'linear-gradient(180deg, #1e1008 0%, #130a04 100%)' }} />
      {/* Floor */}
      <div style={{ position: 'absolute', inset: '48% 0 0 0', background: 'linear-gradient(180deg, #100804 0%, #080401 100%)' }} />
      {/* Baseboard */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(48% - 5px)', height: 10, background: '#261208', boxShadow: '0 3px 14px rgba(0,0,0,0.7)' }} />

      {/* Rug */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        top: '46%', width: '64%', height: '46%',
        background: 'radial-gradient(ellipse at center, #2e1b0d 0%, #1c0e06 65%, transparent 100%)',
        borderRadius: '45%',
        opacity: 0.8,
      }} />

      {/* Dim lights overlay — sits above room bg/couch, below TV (z:10) */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 5,
        background: `rgba(0,0,0,${dimLevel})`,
        pointerEvents: 'none',
        transition: 'background 0.15s',
      }} />

      {/* === TV === */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        top: '3%', width: '54%', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* TV bezel */}
        <div style={{
          width: '100%',
          background: '#0c0c0c',
          borderRadius: 14,
          padding: 6,
          boxShadow: [
            '0 0 0 2px #1e1e1e',
            '0 28px 90px rgba(0,0,0,0.95)',
            isOn ? '0 0 60px rgba(80,120,255,0.08)' : 'none',
          ].join(', '),
          transition: 'box-shadow 0.4s',
        }}>
          {/* Screen 16:9 */}
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              {renderVideo()}
            </div>
          </div>
          {/* Power LED */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: isOn ? '#22c55e' : '#2a2a2a',
              boxShadow: isOn ? '0 0 8px #22c55e' : 'none',
              transition: 'all 0.4s',
            }} />
          </div>
        </div>
        {/* Stand neck */}
        <div style={{ width: 4, height: 14, background: '#111' }} />
        {/* Stand base */}
        <div style={{ width: 60, height: 6, background: '#111', borderRadius: 4 }} />
        {/* TV console */}
        <div style={{
          width: '115%', height: 11, marginTop: 2,
          background: 'linear-gradient(180deg, #2e1a08 0%, #1a0d04 100%)',
          borderRadius: '6px 6px 0 0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }} />
        {/* Buttons row */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Change Video button */}
          <button
            onClick={onToggleUrlInput}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              borderRadius: 8,
              border: urlInputOpen ? '1px solid rgba(var(--accent-rgb,99,102,241),0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: urlInputOpen ? 'rgba(var(--accent-rgb,99,102,241),0.15)' : 'rgba(255,255,255,0.05)',
              color: urlInputOpen ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Link size={12} />
            Change Video
          </button>
          {/* Lobby button */}
          <button
            onClick={onToggleLobby}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              borderRadius: 8,
              border: lobbyOpen ? '1px solid rgba(var(--accent-rgb,99,102,241),0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: lobbyOpen ? 'rgba(var(--accent-rgb,99,102,241),0.15)' : 'rgba(255,255,255,0.05)',
              color: lobbyOpen ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Users size={12} />
            Lobby
          </button>
        </div>
      </div>

      {/* === STRAIGHT COUCH — 8 seats in one row === */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        bottom: '3%', width: COUCH_W, height: COUCH_H,
        background: C_SEAT,
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        {/* Back cushion strip at bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: COUCH_BACK,
          background: C_BACK, borderRadius: '0 0 10px 10px',
        }} />
        {/* Left armrest */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: COUCH_BACK, width: COUCH_ARM,
          background: C_ARM, borderRadius: '10px 0 0 0',
        }} />
        {/* Right armrest */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: COUCH_BACK, width: COUCH_ARM,
          background: C_ARM, borderRadius: '0 10px 0 0',
        }} />
        {/* 7 cushion dividers between 8 seats */}
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: COUCH_BACK,
            left: `calc(${COUCH_ARM}px + ${i} * (100% - ${COUCH_ARM * 2}px) / 8)`,
            width: 1, background: 'rgba(0,0,0,0.2)',
          }} />
        ))}
        {/* 8 users in a row */}
        <div style={{
          position: 'absolute', top: 0, left: COUCH_ARM, right: COUCH_ARM, bottom: COUCH_BACK,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        }}>
          {s.map((user, i) => <Avatar key={i} user={user} color={USER_COLORS[i]} />)}
        </div>
      </div>

      {/* Screen share local preview */}
      {isSharing && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 20,
          width: 128, aspectRatio: '16/9',
          borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          background: '#000',
        }}>
          <video ref={previewRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
