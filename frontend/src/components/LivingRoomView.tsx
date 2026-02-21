import { useRef, useEffect, useState } from 'react'
import { Link, Users, Settings } from 'lucide-react'
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
  onPlay, onPause, onSeek, onEnd, onToggleUrlInput, onToggleLobby, dimLevel,
}: Props) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const [gearOpen, setGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const v = previewRef.current
    if (!v) return
    v.srcObject = isSharing && localStream ? localStream : null
  }, [isSharing, localStream])

  // Close gear menu on click outside
  useEffect(() => {
    if (!gearOpen) return
    const handler = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [gearOpen])

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

      {/* === WALL SCONCE LIGHTS === */}
      {/* Left sconce */}
      <div style={{
        position: 'absolute', left: '8%', top: '18%', zIndex: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Wall glow cast */}
        <div style={{
          position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
          width: 120, height: 120,
          background: `radial-gradient(ellipse at center, rgba(255,180,60,${0.25 * (1 - dimLevel)}) 0%, rgba(255,140,30,${0.08 * (1 - dimLevel)}) 50%, transparent 75%)`,
          pointerEvents: 'none',
          transition: 'all 0.4s ease',
        }} />
        {/* Fixture plate */}
        <div style={{
          width: 18, height: 8, borderRadius: '4px 4px 0 0',
          background: 'linear-gradient(180deg, #3a2a1a, #2a1a0a)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderBottom: 'none',
        }} />
        {/* Fixture arm */}
        <div style={{ width: 3, height: 14, background: '#2a1a0a' }} />
        {/* Shade */}
        <div style={{
          width: 28, height: 16, borderRadius: '3px 3px 8px 8px',
          background: 'linear-gradient(180deg, #4a3520, #3a2515)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: `0 4px 20px rgba(255,160,40,${0.3 * (1 - dimLevel)})`,
          transition: 'box-shadow 0.4s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Visible bulb glow through shade */}
          <div style={{
            width: 12, height: 8, borderRadius: '50%',
            background: `radial-gradient(ellipse at center, rgba(255,220,140,${0.9 * (1 - dimLevel)}), rgba(255,180,60,${0.4 * (1 - dimLevel)}), transparent)`,
            transition: 'all 0.4s ease',
          }} />
        </div>
        {/* Downward light cone */}
        <div style={{
          width: 0, height: 0,
          borderLeft: '20px solid transparent',
          borderRight: '20px solid transparent',
          borderTop: `50px solid rgba(255,200,100,${0.04 * (1 - dimLevel)})`,
          filter: 'blur(6px)',
          transition: 'all 0.4s ease',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Right sconce */}
      <div style={{
        position: 'absolute', right: '8%', top: '18%', zIndex: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Wall glow cast */}
        <div style={{
          position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
          width: 120, height: 120,
          background: `radial-gradient(ellipse at center, rgba(255,180,60,${0.25 * (1 - dimLevel)}) 0%, rgba(255,140,30,${0.08 * (1 - dimLevel)}) 50%, transparent 75%)`,
          pointerEvents: 'none',
          transition: 'all 0.4s ease',
        }} />
        {/* Fixture plate */}
        <div style={{
          width: 18, height: 8, borderRadius: '4px 4px 0 0',
          background: 'linear-gradient(180deg, #3a2a1a, #2a1a0a)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderBottom: 'none',
        }} />
        {/* Fixture arm */}
        <div style={{ width: 3, height: 14, background: '#2a1a0a' }} />
        {/* Shade */}
        <div style={{
          width: 28, height: 16, borderRadius: '3px 3px 8px 8px',
          background: 'linear-gradient(180deg, #4a3520, #3a2515)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: `0 4px 20px rgba(255,160,40,${0.3 * (1 - dimLevel)})`,
          transition: 'box-shadow 0.4s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Visible bulb glow through shade */}
          <div style={{
            width: 12, height: 8, borderRadius: '50%',
            background: `radial-gradient(ellipse at center, rgba(255,220,140,${0.9 * (1 - dimLevel)}), rgba(255,180,60,${0.4 * (1 - dimLevel)}), transparent)`,
            transition: 'all 0.4s ease',
          }} />
        </div>
        {/* Downward light cone */}
        <div style={{
          width: 0, height: 0,
          borderLeft: '20px solid transparent',
          borderRight: '20px solid transparent',
          borderTop: `50px solid rgba(255,200,100,${0.04 * (1 - dimLevel)})`,
          filter: 'blur(6px)',
          transition: 'all 0.4s ease',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Ceiling light */}
      <div style={{
        position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)',
        zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Ceiling mount */}
        <div style={{ width: 24, height: 6, background: '#2a1a0a', borderRadius: '0 0 4px 4px' }} />
        {/* Rod */}
        <div style={{ width: 2, height: 18, background: '#2a1a0a' }} />
        {/* Fixture body */}
        <div style={{
          width: 40, height: 18, borderRadius: '6px 6px 12px 12px',
          background: 'linear-gradient(180deg, #4a3520, #3a2515)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 2,
          boxShadow: `0 6px 30px rgba(255,160,40,${0.35 * (1 - dimLevel)})`,
          transition: 'box-shadow 0.4s ease',
        }}>
          {/* Bulb */}
          <div style={{
            width: 14, height: 10, borderRadius: '0 0 50% 50%',
            background: `radial-gradient(ellipse at center, rgba(255,230,160,${0.95 * (1 - dimLevel)}), rgba(255,180,60,${0.5 * (1 - dimLevel)}), transparent)`,
            transition: 'all 0.4s ease',
          }} />
        </div>
        {/* Downward light pool */}
        <div style={{
          width: 200, height: 160,
          background: `radial-gradient(ellipse at top center, rgba(255,200,100,${0.06 * (1 - dimLevel)}) 0%, transparent 70%)`,
          pointerEvents: 'none',
          transition: 'all 0.4s ease',
        }} />
      </div>

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
        {/* TV screen glow — visible when lights are dimmed and TV is on */}
        {isOn && (
          <div style={{
            position: 'absolute', inset: -30, zIndex: -1,
            background: `radial-gradient(ellipse at center, rgba(100,140,255,${0.12 * dimLevel}) 0%, rgba(60,100,220,${0.06 * dimLevel}) 40%, transparent 70%)`,
            pointerEvents: 'none',
            transition: 'all 0.4s ease',
            filter: 'blur(10px)',
          }} />
        )}
        {/* TV bezel */}
        <div style={{
          width: '100%',
          background: '#0c0c0c',
          borderRadius: 14,
          padding: 6,
          boxShadow: [
            '0 0 0 2px #1e1e1e',
            '0 28px 90px rgba(0,0,0,0.95)',
            isOn ? `0 0 ${40 + 60 * dimLevel}px rgba(80,120,255,${0.08 + 0.18 * dimLevel})` : 'none',
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
      </div>

      {/* === GEAR MENU — center front of couch === */}
      <div ref={gearRef} data-theatre-control style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        bottom: `calc(3% + ${COUCH_H}px + 6px)`, zIndex: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Popup menu */}
        {gearOpen && (
          <div style={{
            position: 'absolute', bottom: '100%', marginBottom: 6,
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: 6, borderRadius: 10,
            background: 'rgba(20,10,5,0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(12px)',
            whiteSpace: 'nowrap',
          }}>
            <button
              onClick={() => { onToggleUrlInput(); setGearOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--accent-rgb,99,102,241),0.15)'; e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb,99,102,241),0.4)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            >
              <Link size={12} />
              Change Video
            </button>
            <button
              onClick={() => { onToggleLobby(); setGearOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--accent-rgb,99,102,241),0.15)'; e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb,99,102,241),0.4)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            >
              <Users size={12} />
              Lobby
            </button>
          </div>
        )}
        {/* Gear button */}
        <button
          onClick={() => setGearOpen(v => !v)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: gearOpen ? '1px solid rgba(var(--accent-rgb,99,102,241),0.5)' : '1px solid rgba(255,255,255,0.1)',
            background: gearOpen ? 'rgba(var(--accent-rgb,99,102,241),0.2)' : 'rgba(255,255,255,0.06)',
            color: gearOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
          }}
        >
          <Settings size={15} style={{ transition: 'transform 0.3s', transform: gearOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        </button>
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
