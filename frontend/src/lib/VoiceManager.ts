import SimplePeer from 'simple-peer'
import type { Socket } from 'socket.io-client'

export interface VoiceSettings {
  inputDevice: string
  outputVolume: number
  inputVolume: number
  pushToTalk: boolean
  pushToTalkKey: string
  noiseSuppression: boolean
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  inputDevice: 'default',
  outputVolume: 100,
  inputVolume: 100,
  pushToTalk: false,
  pushToTalkKey: ' ',
  noiseSuppression: true,
}

interface PeerConnection {
  peer: SimplePeer.Instance
  audioEl: HTMLAudioElement
  analyser: AnalyserNode
  gainNode: GainNode
  sourceNode: MediaStreamAudioSourceNode | null
}

export type VoiceEventType =
  | 'speaking-change'
  | 'muted-change'
  | 'voice-state-change'
  | 'voice-users-change'
  | 'input-devices-change'

export type VoiceEventHandler = (data?: unknown) => void

export class VoiceManager {
  private socket: Socket
  private peers = new Map<string, PeerConnection>()
  private localStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private inputGainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private speakingUsers = new Set<string>()
  private vadIntervalId: ReturnType<typeof setInterval> | null = null
  private localVadIntervalId: ReturnType<typeof setInterval> | null = null
  private isMuted = true
  private isInVoice = false
  private settings: VoiceSettings
  private listeners = new Map<VoiceEventType, Set<VoiceEventHandler>>()
  private voiceUsers = new Set<string>()
  private pttKeyDown = false
  private pttBound = false
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  constructor(socket: Socket, settings: VoiceSettings) {
    this.socket = socket
    this.settings = { ...settings }
    this.setupSocketListeners()
  }

  private emit(event: VoiceEventType, data?: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(data))
  }

  on(event: VoiceEventType, handler: VoiceEventHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off(event: VoiceEventType, handler: VoiceEventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  private setupSocketListeners() {
    this.socket.on('voice:active-users' as string, (data: { userIds: string[] }) => {
      for (const userId of data.userIds) {
        this.voiceUsers.add(userId)
        this.createPeer(userId, true)
      }
      this.emit('voice-users-change')
    })

    this.socket.on('voice:user-joined' as string, (data: { userId: string }) => {
      // Track them as a voice user — they will initiate the peer connection to us
      this.voiceUsers.add(data.userId)
      this.emit('voice-users-change')
    })

    this.socket.on('voice:user-left' as string, (data: { userId: string }) => {
      this.destroyPeer(data.userId)
      this.voiceUsers.delete(data.userId)
      this.speakingUsers.delete(data.userId)
      this.emit('voice-users-change')
      this.emit('speaking-change')
      this.emit('voice-state-change')
    })

    this.socket.on('voice:offer' as string, (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      if (!this.isInVoice || !this.localStream) return
      this.createPeer(data.from, false, data.offer)
    })

    this.socket.on('voice:answer' as string, (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const conn = this.peers.get(data.from)
      if (conn) {
        conn.peer.signal(data.answer as SimplePeer.SignalData)
      }
    })

    this.socket.on('voice:ice-candidate' as string, (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const conn = this.peers.get(data.from)
      if (conn) {
        conn.peer.signal({ candidate: data.candidate } as SimplePeer.SignalData)
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

  async joinVoice() {
    if (this.isInVoice) return

    try {
      await this.fetchIceServers()
      this.audioContext = new AudioContext()
      // Resume AudioContext in case browser suspended it (no user gesture yet)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.settings.inputDevice !== 'default' ? { exact: this.settings.inputDevice } : undefined,
          noiseSuppression: this.settings.noiseSuppression,
          echoCancellation: true,
          autoGainControl: true,
        },
      })

      // Set up input gain control
      const source = this.audioContext.createMediaStreamSource(this.localStream)
      this.inputGainNode = this.audioContext.createGain()
      this.inputGainNode.gain.value = this.settings.inputVolume / 100

      // Analyser for local VAD
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 256
      source.connect(this.inputGainNode)
      this.inputGainNode.connect(this.analyserNode)
      // Don't connect to destination (we don't want to hear ourselves)

      // Start muted
      this.isMuted = true
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = false))

      this.isInVoice = true
      this.voiceUsers.add(this.socket.id!)
      this.socket.emit('voice:join' as string)

      this.startLocalVAD()

      if (this.settings.pushToTalk) {
        this.bindPTT()
      }

      this.emit('voice-state-change')
      this.emit('muted-change')
    } catch (err) {
      console.error('Failed to join voice:', err)
      this.isInVoice = false
      this.emit('voice-state-change')
    }
  }

  leaveVoice() {
    if (!this.isInVoice) return

    this.socket.emit('voice:leave' as string)

    for (const [userId] of this.peers) {
      this.destroyPeer(userId)
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }

    this.stopLocalVAD()
    this.unbindPTT()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.inputGainNode = null
    this.analyserNode = null
    this.speakingUsers.clear()
    this.voiceUsers.clear()
    this.isInVoice = false
    this.isMuted = true

    this.emit('voice-state-change')
    this.emit('muted-change')
    this.emit('speaking-change')
    this.emit('voice-users-change')
  }

  private createPeer(userId: string, initiator: boolean, offer?: RTCSessionDescriptionInit) {
    if (this.peers.has(userId)) {
      this.destroyPeer(userId)
    }

    if (!this.localStream) return

    const peer = new SimplePeer({
      initiator,
      stream: this.localStream,
      trickle: true,
      config: {
        iceServers: this.iceServers,
      },
    })

    const audioEl = new Audio()
    audioEl.autoplay = true

    // Create audio nodes for this peer (will be set up on stream)
    const analyser = this.audioContext!.createAnalyser()
    analyser.fftSize = 256
    const gainNode = this.audioContext!.createGain()
    gainNode.gain.value = this.settings.outputVolume / 100

    const conn: PeerConnection = { peer, audioEl, analyser, gainNode, sourceNode: null }
    this.peers.set(userId, conn)

    peer.on('signal', (signalData: SimplePeer.SignalData) => {
      if (signalData.type === 'offer') {
        this.socket.emit('voice:offer' as string, { to: userId, offer: signalData })
      } else if (signalData.type === 'answer') {
        this.socket.emit('voice:answer' as string, { to: userId, answer: signalData })
      } else if ('candidate' in signalData && signalData.candidate) {
        this.socket.emit('voice:ice-candidate' as string, { to: userId, candidate: signalData.candidate })
      }
    })

    peer.on('stream', (stream: MediaStream) => {
      // Set stream on audio element as fallback
      audioEl.srcObject = stream

      // Connect to Web Audio API for volume control + VAD
      try {
        // Resume AudioContext if suspended (stream arrival = good time to try)
        if (this.audioContext!.state === 'suspended') {
          this.audioContext!.resume()
        }
        const source = this.audioContext!.createMediaStreamSource(stream)
        conn.sourceNode = source
        source.connect(gainNode)
        gainNode.connect(analyser)
        analyser.connect(this.audioContext!.destination)
        // Mute HTML audio element — Web Audio API handles playback now
        // Without this, audio plays twice (echo/double volume)
        audioEl.muted = true
      } catch (e) {
        console.warn('Failed to setup audio processing for peer, falling back to audio element:', e)
        // Audio element remains unmuted as fallback
      }

      this.startRemoteVAD()
    })

    peer.on('error', (err: Error) => {
      console.warn(`Peer connection error with ${userId}:`, err.message)
      this.destroyPeer(userId)
    })

    peer.on('close', () => {
      this.destroyPeer(userId)
      this.speakingUsers.delete(userId)
      this.emit('speaking-change')
    })

    if (offer) {
      peer.signal(offer as SimplePeer.SignalData)
    }
  }

  private destroyPeer(userId: string) {
    const conn = this.peers.get(userId)
    if (!conn) return

    try {
      conn.sourceNode?.disconnect()
      conn.gainNode.disconnect()
      conn.analyser.disconnect()
      conn.peer.destroy()
      conn.audioEl.srcObject = null
    } catch {
      // Ignore cleanup errors
    }

    this.peers.delete(userId)
  }

  setMuted(muted: boolean) {
    if (!this.isInVoice) return
    // If push-to-talk is enabled, don't allow manual unmute
    if (this.settings.pushToTalk && !muted) return

    this.isMuted = muted
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
    this.emit('muted-change')
  }

  toggleMute() {
    if (this.settings.pushToTalk) return
    // Resume AudioContext on user gesture if it was suspended
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume()
    }
    this.setMuted(!this.isMuted)
  }

  setVolume(userId: string, volume: number) {
    const conn = this.peers.get(userId)
    if (conn) {
      conn.gainNode.gain.value = volume / 100
    }
  }

  setOutputVolume(volume: number) {
    this.settings.outputVolume = volume
    for (const [, conn] of this.peers) {
      conn.gainNode.gain.value = volume / 100
    }
  }

  setInputVolume(volume: number) {
    this.settings.inputVolume = volume
    if (this.inputGainNode) {
      this.inputGainNode.gain.value = volume / 100
    }
  }

  async setInputDevice(deviceId: string) {
    this.settings.inputDevice = deviceId
    if (!this.isInVoice || !this.localStream) return

    // Get new stream with new device
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        noiseSuppression: this.settings.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
    })

    // Stop old tracks
    this.localStream.getTracks().forEach((t) => t.stop())

    // Apply mute state to new tracks
    newStream.getAudioTracks().forEach((t) => (t.enabled = !this.isMuted))
    this.localStream = newStream

    // Reconnect audio processing
    if (this.audioContext && this.inputGainNode && this.analyserNode) {
      const source = this.audioContext.createMediaStreamSource(newStream)
      source.connect(this.inputGainNode)
    }

    // Replace stream in all peers
    for (const [, conn] of this.peers) {
      try {
        const oldTrack = conn.peer.streams?.[0]?.getAudioTracks()[0]
        const newTrack = newStream.getAudioTracks()[0]
        if (oldTrack && newTrack) {
          conn.peer.replaceTrack(oldTrack, newTrack, this.localStream)
        }
      } catch {
        // If replaceTrack fails, the peer will still work with old track
      }
    }
  }

  updateSettings(newSettings: Partial<VoiceSettings>) {
    const oldPTT = this.settings.pushToTalk
    Object.assign(this.settings, newSettings)

    if (newSettings.outputVolume !== undefined) this.setOutputVolume(newSettings.outputVolume)
    if (newSettings.inputVolume !== undefined) this.setInputVolume(newSettings.inputVolume)
    if (newSettings.inputDevice !== undefined) this.setInputDevice(newSettings.inputDevice)

    if (newSettings.pushToTalk !== undefined && newSettings.pushToTalk !== oldPTT) {
      if (newSettings.pushToTalk) {
        this.setMuted(true)
        this.bindPTT()
      } else {
        this.unbindPTT()
      }
    }
  }

  // Push-to-talk
  private bindPTT() {
    if (this.pttBound) return
    this.pttBound = true

    window.addEventListener('keydown', this.handlePTTDown)
    window.addEventListener('keyup', this.handlePTTUp)
    window.addEventListener('blur', this.handlePTTBlur)
  }

  private unbindPTT() {
    if (!this.pttBound) return
    this.pttBound = false
    this.pttKeyDown = false

    window.removeEventListener('keydown', this.handlePTTDown)
    window.removeEventListener('keyup', this.handlePTTUp)
    window.removeEventListener('blur', this.handlePTTBlur)

    // Re-apply mute
    if (this.isInVoice) {
      this.isMuted = true
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      this.emit('muted-change')
    }
  }

  private handlePTTDown = (e: KeyboardEvent) => {
    if (!this.isInVoice || !this.settings.pushToTalk) return
    // Don't trigger PTT if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === this.settings.pushToTalkKey && !this.pttKeyDown) {
      e.preventDefault()
      this.pttKeyDown = true
      this.isMuted = false
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = true))
      this.emit('muted-change')
    }
  }

  private handlePTTUp = (e: KeyboardEvent) => {
    if (!this.isInVoice || !this.settings.pushToTalk) return
    if (e.key === this.settings.pushToTalkKey) {
      this.pttKeyDown = false
      this.isMuted = true
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      this.emit('muted-change')
    }
  }

  private handlePTTBlur = () => {
    if (this.pttKeyDown) {
      this.pttKeyDown = false
      this.isMuted = true
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      this.emit('muted-change')
    }
  }

  // VAD for remote peers
  private startRemoteVAD() {
    if (this.vadIntervalId) return

    const dataArray = new Uint8Array(128)
    this.vadIntervalId = setInterval(() => {
      const newSpeaking = new Set<string>()

      for (const [userId, conn] of this.peers) {
        conn.analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        if (avg > 15) {
          newSpeaking.add(userId)
        }
      }

      // Check if changed
      let changed = false
      if (newSpeaking.size !== this.speakingUsers.size) {
        changed = true
      } else {
        for (const uid of newSpeaking) {
          if (!this.speakingUsers.has(uid)) { changed = true; break }
        }
      }

      if (changed) {
        // Keep users who are still speaking, add new ones
        // Use debounce: only remove users who have been silent for more than 1 check
        for (const uid of newSpeaking) {
          this.speakingUsers.add(uid)
        }
        for (const uid of this.speakingUsers) {
          if (!newSpeaking.has(uid) && uid !== this.socket.id) {
            this.speakingUsers.delete(uid)
          }
        }
        this.emit('speaking-change')
      }
    }, 33) // ~30fps
  }

  // VAD for local mic
  private startLocalVAD() {
    if (this.localVadIntervalId || !this.analyserNode) return

    const dataArray = new Uint8Array(128)
    let wasSpeaking = false

    this.localVadIntervalId = setInterval(() => {
      if (!this.analyserNode || this.isMuted) {
        if (wasSpeaking) {
          wasSpeaking = false
          this.speakingUsers.delete(this.socket.id!)
          this.emit('speaking-change')
        }
        return
      }

      this.analyserNode.getByteFrequencyData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
      const avg = sum / dataArray.length
      const isSpeaking = avg > 15

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking
        if (isSpeaking) {
          this.speakingUsers.add(this.socket.id!)
        } else {
          this.speakingUsers.delete(this.socket.id!)
        }
        this.emit('speaking-change')
      }
    }, 33)
  }

  private stopLocalVAD() {
    if (this.localVadIntervalId) {
      clearInterval(this.localVadIntervalId)
      this.localVadIntervalId = null
    }
    if (this.vadIntervalId) {
      clearInterval(this.vadIntervalId)
      this.vadIntervalId = null
    }
  }

  // Getters
  getIsMuted() { return this.isMuted }
  getIsInVoice() { return this.isInVoice }
  getSpeakingUsers() { return new Set(this.speakingUsers) }
  getVoiceUsers() { return new Set(this.voiceUsers) }
  getSettings() { return { ...this.settings } }
  getPeerCount() { return this.peers.size }

  async getInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter((d) => d.kind === 'audioinput')
    } catch {
      return []
    }
  }

  destroy() {
    this.leaveVoice()
    this.socket.off('voice:active-users' as string)
    this.socket.off('voice:user-joined' as string)
    this.socket.off('voice:user-left' as string)
    this.socket.off('voice:offer' as string)
    this.socket.off('voice:answer' as string)
    this.socket.off('voice:ice-candidate' as string)
    this.listeners.clear()
  }
}
