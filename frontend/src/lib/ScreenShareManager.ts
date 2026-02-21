import SimplePeer from 'simple-peer'
import type { Socket } from 'socket.io-client'

export type ScreenShareEventType =
  | 'state-change'
  | 'stream-received'
  | 'stream-ended'
  | 'error'

export type ScreenShareEventHandler = (data?: unknown) => void

export class ScreenShareManager {
  private socket: Socket
  private peers = new Map<string, SimplePeer.Instance>()
  private _localStream: MediaStream | null = null
  private _remoteStream: MediaStream | null = null
  private _isSharing = false
  private _isViewing = false
  private _sharerId: string | null = null
  private _lastError: string | null = null
  private listeners = new Map<ScreenShareEventType, Set<ScreenShareEventHandler>>()
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  constructor(socket: Socket) {
    this.socket = socket
    this.setupSocketListeners()
  }

  private emit(event: ScreenShareEventType, data?: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(data))
  }

  on(event: ScreenShareEventType, handler: ScreenShareEventHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off(event: ScreenShareEventType, handler: ScreenShareEventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  private setupSocketListeners() {
    this.socket.on('screen:started' as string, (data: { sharerId: string }) => {
      this._sharerId = data.sharerId
      this._isViewing = true
      this.emit('state-change')
    })

    this.socket.on('screen:stopped' as string, () => {
      this._sharerId = null
      this._isViewing = false
      this._remoteStream = null
      // Destroy all viewer-side peers
      for (const [peerId] of this.peers) {
        this.destroyPeer(peerId)
      }
      this.emit('stream-ended')
      this.emit('state-change')
    })

    this.socket.on('screen:viewer-joined' as string, (data: { viewerId: string }) => {
      if (!this._isSharing || !this._localStream) return
      this.createPeerAsSharer(data.viewerId)
    })

    this.socket.on('screen:offer' as string, (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      if (!this._isViewing) return
      this.createPeerAsViewer(data.from, data.offer)
    })

    this.socket.on('screen:answer' as string, (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const peer = this.peers.get(data.from)
      if (peer) {
        peer.signal(data.answer as SimplePeer.SignalData)
      }
    })

    this.socket.on('screen:ice-candidate' as string, (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const peer = this.peers.get(data.from)
      if (peer) {
        peer.signal({ candidate: data.candidate } as SimplePeer.SignalData)
      }
    })
  }

  private async fetchIceServers() {
    try {
      const res = await fetch('/api/ice-servers')
      if (res.ok) {
        const data = await res.json()
        if (data.iceServers?.length) {
          this.iceServers = data.iceServers
        }
      }
    } catch {
      // Fall back to default STUN servers
    }
  }

  async startSharing() {
    if (this._isSharing) return
    this._lastError = null

    try {
      await this.fetchIceServers()

      this._localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      })

      // Detect when user stops sharing via browser's "Stop sharing" button
      const videoTrack = this._localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          this.stopSharing()
        })
      }

      this._isSharing = true
      this._sharerId = this.socket.id!
      this.socket.emit('screen:start' as string)
      this.emit('state-change')
    } catch (err) {
      console.error('Failed to start screen share:', err)
      if (this._localStream) {
        this._localStream.getTracks().forEach((t) => t.stop())
        this._localStream = null
      }

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          this._lastError = 'Screen sharing was cancelled or denied.'
        } else {
          this._lastError = `Screen share error: ${err.message}`
        }
      } else {
        this._lastError = 'Failed to start screen sharing.'
      }

      this.emit('error', this._lastError)
      this.emit('state-change')
    }
  }

  stopSharing() {
    if (!this._isSharing) return

    this.socket.emit('screen:stop' as string)

    for (const [peerId] of this.peers) {
      this.destroyPeer(peerId)
    }

    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop())
      this._localStream = null
    }

    this._isSharing = false
    this._sharerId = null
    this.emit('state-change')
  }

  private createPeerAsSharer(viewerId: string) {
    if (this.peers.has(viewerId)) {
      this.destroyPeer(viewerId)
    }

    if (!this._localStream) return

    const peer = new SimplePeer({
      initiator: true,
      stream: this._localStream,
      trickle: true,
      config: {
        iceServers: this.iceServers,
      },
    })

    this.peers.set(viewerId, peer)

    peer.on('signal', (signalData: SimplePeer.SignalData) => {
      if (signalData.type === 'offer') {
        this.socket.emit('screen:offer' as string, { to: viewerId, offer: signalData })
      } else if (signalData.type === 'answer') {
        this.socket.emit('screen:answer' as string, { to: viewerId, answer: signalData })
      } else if ('candidate' in signalData && signalData.candidate) {
        this.socket.emit('screen:ice-candidate' as string, { to: viewerId, candidate: signalData.candidate })
      }
    })

    peer.on('connect', () => {
      // Set high bitrate for screen share: 4 Mbps video, 128 kbps audio
      try {
        const pc = (peer as unknown as { _pc: RTCPeerConnection })._pc
        for (const sender of pc.getSenders()) {
          const params = sender.getParameters()
          if (!params.encodings?.length) continue
          if (sender.track?.kind === 'video') {
            params.encodings[0].maxBitrate = 4_000_000
            sender.setParameters(params).catch(() => {})
          } else if (sender.track?.kind === 'audio') {
            params.encodings[0].maxBitrate = 128_000
            sender.setParameters(params).catch(() => {})
          }
        }
      } catch {
        // Non-critical
      }
    })

    peer.on('error', (err: Error) => {
      console.warn(`Screen share peer error with ${viewerId}:`, err.message)
      this.destroyPeer(viewerId)
    })

    peer.on('close', () => {
      this.destroyPeer(viewerId)
    })
  }

  private createPeerAsViewer(sharerId: string, offer: RTCSessionDescriptionInit) {
    if (this.peers.has(sharerId)) {
      this.destroyPeer(sharerId)
    }

    const peer = new SimplePeer({
      initiator: false,
      trickle: true,
      config: {
        iceServers: this.iceServers,
      },
    })

    this.peers.set(sharerId, peer)

    peer.on('signal', (signalData: SimplePeer.SignalData) => {
      if (signalData.type === 'answer') {
        this.socket.emit('screen:answer' as string, { to: sharerId, answer: signalData })
      } else if ('candidate' in signalData && signalData.candidate) {
        this.socket.emit('screen:ice-candidate' as string, { to: sharerId, candidate: signalData.candidate })
      }
    })

    peer.on('stream', (stream: MediaStream) => {
      this._remoteStream = stream
      this.emit('stream-received', stream)
      this.emit('state-change')
    })

    peer.on('error', (err: Error) => {
      console.warn(`Screen share viewer peer error with ${sharerId}:`, err.message)
      this.destroyPeer(sharerId)
    })

    peer.on('close', () => {
      this.destroyPeer(sharerId)
      this._remoteStream = null
      this.emit('stream-ended')
      this.emit('state-change')
    })

    peer.signal(offer as SimplePeer.SignalData)
  }

  private destroyPeer(peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer) return

    try {
      peer.destroy()
    } catch {
      // Ignore cleanup errors
    }

    this.peers.delete(peerId)
  }

  // Initialize viewing state from room:state (for users who join while share is active)
  setInitialState(sharerId: string | null) {
    if (sharerId && sharerId !== this.socket.id) {
      this._sharerId = sharerId
      this._isViewing = true
      this.emit('state-change')
    }
  }

  // Getters
  get isSharing() { return this._isSharing }
  get isViewing() { return this._isViewing }
  get sharerId() { return this._sharerId }
  get localStream() { return this._localStream }
  get remoteStream() { return this._remoteStream }
  get lastError() { return this._lastError }

  destroy() {
    this.stopSharing()

    // Also destroy viewer peers
    for (const [peerId] of this.peers) {
      this.destroyPeer(peerId)
    }

    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop())
      this._localStream = null
    }

    this.socket.off('screen:started' as string)
    this.socket.off('screen:stopped' as string)
    this.socket.off('screen:viewer-joined' as string)
    this.socket.off('screen:offer' as string)
    this.socket.off('screen:answer' as string)
    this.socket.off('screen:ice-candidate' as string)
    this.listeners.clear()
  }
}
