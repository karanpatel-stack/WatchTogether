import SimplePeer from 'simple-peer'
import type { Socket } from 'socket.io-client'

// ——— Quality Presets ———

export type AudioQualityPreset = 'low' | 'medium' | 'high' | 'ultra'

interface AudioQualityConfig {
  label: string
  bitrate: number
  channelCount: number
  fmtp: Record<string, number>
  ptime: number
}

export const AUDIO_QUALITY_PRESETS: Record<AudioQualityPreset, AudioQualityConfig> = {
  low: {
    label: 'Low',
    bitrate: 32_000,
    channelCount: 1,
    fmtp: {
      maxaveragebitrate: 32000,
      useinbandfec: 1,
      usedtx: 1,
      minptime: 20,
    },
    ptime: 20,
  },
  medium: {
    label: 'Medium',
    bitrate: 64_000,
    channelCount: 1,
    fmtp: {
      maxaveragebitrate: 64000,
      useinbandfec: 1,
      usedtx: 0,
      minptime: 10,
    },
    ptime: 20,
  },
  high: {
    label: 'High',
    bitrate: 96_000,
    channelCount: 1,
    fmtp: {
      maxaveragebitrate: 96000,
      useinbandfec: 1,
      usedtx: 0,
      minptime: 10,
    },
    ptime: 10,
  },
  ultra: {
    label: 'Ultra',
    bitrate: 128_000,
    channelCount: 2,
    fmtp: {
      maxaveragebitrate: 128000,
      useinbandfec: 1,
      usedtx: 0,
      stereo: 1,
      'sprop-stereo': 1,
      minptime: 10,
    },
    ptime: 10,
  },
}

function applyOpusSdpTransform(sdp: string, config: AudioQualityConfig): string {
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/)
  if (!opusMatch) return sdp
  const pt = opusMatch[1]

  // Build fmtp string from config
  const fmtpParts = Object.entries(config.fmtp)
    .map(([k, v]) => `${k}=${v}`)
    .join(';')
  const qualityFmtp = `a=fmtp:${pt} ${fmtpParts}\r\n`

  // Replace existing fmtp or insert after rtpmap
  const fmtpRegex = new RegExp(`a=fmtp:${pt} [^\r\n]+\r\n`)
  if (fmtpRegex.test(sdp)) {
    sdp = sdp.replace(fmtpRegex, qualityFmtp)
  } else {
    sdp = sdp.replace(
      new RegExp(`(a=rtpmap:${pt} opus/48000/2\r\n)`),
      `$1${qualityFmtp}`
    )
  }

  // Set ptime
  const ptimeRegex = /a=ptime:\d+\r\n/
  const ptimeLine = `a=ptime:${config.ptime}\r\n`
  if (ptimeRegex.test(sdp)) {
    sdp = sdp.replace(ptimeRegex, ptimeLine)
  } else {
    sdp = sdp.replace(
      new RegExp(`(a=rtpmap:${pt} opus/48000/2\r\n)`),
      `$1${ptimeLine}`
    )
  }

  return sdp
}

// ——— Settings ———

export interface VoiceSettings {
  inputDevice: string
  outputVolume: number
  inputVolume: number
  pushToTalk: boolean
  pushToTalkKey: string
  noiseSuppression: boolean
  audioQuality: AudioQualityPreset
  advancedNoiseSuppression: boolean
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  inputDevice: 'default',
  outputVolume: 100,
  inputVolume: 100,
  pushToTalk: false,
  pushToTalkKey: ' ',
  noiseSuppression: true,
  audioQuality: 'high',
  advancedNoiseSuppression: false,
}

// ——— Peer Connection ———

interface PeerConnection {
  peer: SimplePeer.Instance
  audioEl: HTMLAudioElement
  analyser: AnalyserNode
  gainNode: GainNode
  sourceNode: MediaStreamAudioSourceNode | null
  outputHighPass: BiquadFilterNode | null
  outputCompressor: DynamicsCompressorNode | null
  vadBuffer: Float32Array<ArrayBuffer>
  holdFrames: number
  wasSpeaking: boolean
}

// ——— Events ———

export type VoiceEventType =
  | 'speaking-change'
  | 'muted-change'
  | 'voice-state-change'
  | 'voice-users-change'
  | 'input-devices-change'
  | 'error'

export type VoiceEventHandler = (data?: unknown) => void

// ——— VAD Constants ———

const SPEECH_THRESHOLD = 0.008
const SILENCE_THRESHOLD = 0.004
const HOLD_FRAMES = 8 // ~264ms at 30fps
const NOISE_GATE_FLOOR = 0.005 // comfort noise floor

// ——— Voice Manager ———

export class VoiceManager {
  private socket: Socket
  private peers = new Map<string, PeerConnection>()
  private localStream: MediaStream | null = null
  private processedStream: MediaStream | null = null
  private processedStreamDest: MediaStreamAudioDestinationNode | null = null
  private audioContext: AudioContext | null = null
  private localSourceNode: MediaStreamAudioSourceNode | null = null
  private inputGainNode: GainNode | null = null
  private highPassFilter: BiquadFilterNode | null = null
  private lowPassFilter: BiquadFilterNode | null = null
  private compressorNode: DynamicsCompressorNode | null = null
  private noiseGateGain: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private rnnoiseNode: AudioWorkletNode | null = null
  private speakingUsers = new Set<string>()
  private vadIntervalId: ReturnType<typeof setInterval> | null = null
  private localVadIntervalId: ReturnType<typeof setInterval> | null = null
  private isMuted = true
  private isInVoice = false
  private settings: VoiceSettings
  private listeners = new Map<VoiceEventType, Set<VoiceEventHandler>>()
  private voiceUsers = new Set<string>()
  private lastError: string | null = null
  private pttKeyDown = false
  private pttBound = false
  private localVadHoldFrames = 0
  private localWasSpeaking = false
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
      if (!this.isInVoice || (!this.processedStream && !this.localStream)) return
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
    this.lastError = null

    const config = AUDIO_QUALITY_PRESETS[this.settings.audioQuality]

    try {
      await this.fetchIceServers()

      // Create AudioContext first, then getUserMedia — ensures sample rates match
      // The browser's default AudioContext rate is what getUserMedia will deliver
      this.audioContext = new AudioContext()

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.settings.inputDevice !== 'default' ? { exact: this.settings.inputDevice } : undefined,
          noiseSuppression: this.settings.noiseSuppression,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: config.channelCount,
        },
      })
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Build audio processing pipeline:
      // Source → InputGain → HighPass(80Hz) → LowPass(14kHz) → [RNNoise] → Compressor → Analyser → NoiseGate → Destination
      this.localSourceNode = this.audioContext.createMediaStreamSource(this.localStream)

      // Input gain control
      this.inputGainNode = this.audioContext.createGain()
      this.inputGainNode.gain.value = this.settings.inputVolume / 100

      // High-pass filter (80Hz) — removes AC hum, desk rumble, plosive pops
      this.highPassFilter = this.audioContext.createBiquadFilter()
      this.highPassFilter.type = 'highpass'
      this.highPassFilter.frequency.value = 80
      this.highPassFilter.Q.value = 0.707 // Butterworth

      // Low-pass filter (14kHz) — cuts high-freq hiss above voice range
      this.lowPassFilter = this.audioContext.createBiquadFilter()
      this.lowPassFilter.type = 'lowpass'
      this.lowPassFilter.frequency.value = 14000
      this.lowPassFilter.Q.value = 0.707 // Butterworth

      // Dynamics compressor — normalizes volume across users
      this.compressorNode = this.audioContext.createDynamicsCompressor()
      this.compressorNode.threshold.value = -24
      this.compressorNode.ratio.value = 4
      this.compressorNode.knee.value = 12
      this.compressorNode.attack.value = 0.003 // 3ms
      this.compressorNode.release.value = 0.15 // 150ms

      // Analyser for VAD (before noise gate so we read unmasked signal)
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 2048

      // Noise gate (GainNode controlled by VAD) — starts open, VAD closes it on silence
      this.noiseGateGain = this.audioContext.createGain()
      this.noiseGateGain.gain.value = 1.0

      // Output destination for processed stream
      this.processedStreamDest = this.audioContext.createMediaStreamDestination()

      // Connect the chain
      this.localSourceNode.connect(this.inputGainNode)
      this.inputGainNode.connect(this.highPassFilter)
      this.highPassFilter.connect(this.lowPassFilter)

      // RNNoise insertion point: between lowPass and compressor
      let preCompressorNode: AudioNode = this.lowPassFilter

      if (this.settings.advancedNoiseSuppression) {
        try {
          const { createRNNoiseNode } = await import('./RNNoiseProcessor')
          this.rnnoiseNode = await createRNNoiseNode(this.audioContext)
          this.lowPassFilter.connect(this.rnnoiseNode)
          preCompressorNode = this.rnnoiseNode
        } catch (e) {
          console.warn('Failed to load RNNoise, falling back to standard processing:', e)
        }
      }

      preCompressorNode.connect(this.compressorNode)
      this.compressorNode.connect(this.analyserNode)
      this.analyserNode.connect(this.noiseGateGain)
      this.noiseGateGain.connect(this.processedStreamDest)

      // Use processed stream for WebRTC
      this.processedStream = this.processedStreamDest.stream

      // Start muted — only disable source tracks; processedStream stays enabled
      // so WebRTC keeps the track alive, and the pipeline just receives silence
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
      // Clean up partial state
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop())
        this.localStream = null
      }
      if (this.processedStream) {
        this.processedStream.getTracks().forEach((t) => t.stop())
        this.processedStream = null
      }
      try { this.rnnoiseNode?.disconnect() } catch { /* ignore */ }
      this.rnnoiseNode = null
      if (this.audioContext) {
        this.audioContext.close()
        this.audioContext = null
      }
      this.isInVoice = false

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          this.lastError = 'Microphone access denied. Allow mic permission and try again.'
        } else if (err.name === 'NotFoundError') {
          this.lastError = 'No microphone found. Connect a mic and try again.'
        } else {
          this.lastError = `Mic error: ${err.message}`
        }
      } else {
        this.lastError = 'Failed to join voice chat.'
      }

      this.emit('error', this.lastError)
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

    if (this.processedStream) {
      this.processedStream.getTracks().forEach((t) => t.stop())
      this.processedStream = null
    }

    this.stopLocalVAD()
    this.unbindPTT()

    // Disconnect RNNoise node
    try { this.rnnoiseNode?.disconnect() } catch { /* ignore */ }
    this.rnnoiseNode = null

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.localSourceNode = null
    this.inputGainNode = null
    this.highPassFilter = null
    this.lowPassFilter = null
    this.compressorNode = null
    this.noiseGateGain = null
    this.analyserNode = null
    this.processedStreamDest = null
    this.speakingUsers.clear()
    this.voiceUsers.clear()
    this.isInVoice = false
    this.isMuted = true
    this.localVadHoldFrames = 0
    this.localWasSpeaking = false

    this.emit('voice-state-change')
    this.emit('muted-change')
    this.emit('speaking-change')
    this.emit('voice-users-change')
  }

  private createPeer(userId: string, initiator: boolean, offer?: RTCSessionDescriptionInit) {
    if (this.peers.has(userId)) {
      this.destroyPeer(userId)
    }

    const streamToSend = this.processedStream || this.localStream
    if (!streamToSend) return

    const config = AUDIO_QUALITY_PRESETS[this.settings.audioQuality]

    const peer = new SimplePeer({
      initiator,
      stream: streamToSend,
      trickle: true,
      config: {
        iceServers: this.iceServers,
      },
      sdpTransform: (sdp: string) => applyOpusSdpTransform(sdp, config),
    })

    const audioEl = new Audio()
    audioEl.autoplay = true

    const analyser = this.audioContext!.createAnalyser()
    analyser.fftSize = 2048
    const gainNode = this.audioContext!.createGain()
    gainNode.gain.value = this.settings.outputVolume / 100

    const conn: PeerConnection = {
      peer,
      audioEl,
      analyser,
      gainNode,
      sourceNode: null,
      outputHighPass: null,
      outputCompressor: null,
      vadBuffer: new Float32Array(new ArrayBuffer(2048 * 4)),
      holdFrames: 0,
      wasSpeaking: false,
    }
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
      audioEl.srcObject = stream

      // Output processing: HighPass(60Hz) → Compressor → GainNode → Analyser → Destination
      try {
        if (this.audioContext!.state === 'suspended') {
          this.audioContext!.resume()
        }
        const source = this.audioContext!.createMediaStreamSource(stream)
        conn.sourceNode = source

        // Output high-pass filter (60Hz) — protects from pops and rumble
        const outputHP = this.audioContext!.createBiquadFilter()
        outputHP.type = 'highpass'
        outputHP.frequency.value = 60
        outputHP.Q.value = 0.707
        conn.outputHighPass = outputHP

        // Output compressor — prevents volume spikes from unprocessed peers
        const outputComp = this.audioContext!.createDynamicsCompressor()
        outputComp.threshold.value = -20
        outputComp.ratio.value = 3
        outputComp.knee.value = 10
        outputComp.attack.value = 0.003
        outputComp.release.value = 0.15
        conn.outputCompressor = outputComp

        source.connect(outputHP)
        outputHP.connect(outputComp)
        outputComp.connect(gainNode)
        gainNode.connect(analyser)
        analyser.connect(this.audioContext!.destination)

        // Mute HTML audio element — Web Audio API handles playback
        audioEl.muted = true
      } catch (e) {
        console.warn('Failed to setup audio processing for peer, falling back to audio element:', e)
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

    peer.on('connect', () => {
      try {
        const pc = (peer as unknown as { _pc: RTCPeerConnection })._pc

        // Set encoding parameters from preset
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'audio') {
            const params = sender.getParameters()
            if (params.encodings?.length) {
              params.encodings[0].maxBitrate = config.bitrate
              params.encodings[0].priority = 'high'
              // networkPriority may not be in TS types but is in the spec
              ;(params.encodings[0] as Record<string, unknown>).networkPriority = 'high'
              sender.setParameters(params).catch(() => {})
            }
          }
        }

        // Jitter buffer hint for low-latency playback
        for (const receiver of pc.getReceivers()) {
          if (receiver.track?.kind === 'audio') {
            ;(receiver as unknown as Record<string, unknown>).playoutDelayHint = 0.05
          }
        }
      } catch {
        // Non-critical; SDP transform already handles quality
      }
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
      conn.outputHighPass?.disconnect()
      conn.outputCompressor?.disconnect()
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

    // Switching mics may change sample rate — safest to do a full reconnect
    // which rebuilds the entire audio pipeline at the new mic's rate
    await this.reconnectWithNewSettings()
  }

  updateSettings(newSettings: Partial<VoiceSettings>) {
    const oldPTT = this.settings.pushToTalk
    const oldQuality = this.settings.audioQuality
    const oldAdvNS = this.settings.advancedNoiseSuppression
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

    // Reconnect if quality or advanced noise suppression changed
    if (
      (newSettings.audioQuality !== undefined && newSettings.audioQuality !== oldQuality) ||
      (newSettings.advancedNoiseSuppression !== undefined && newSettings.advancedNoiseSuppression !== oldAdvNS)
    ) {
      this.reconnectWithNewSettings()
    }
  }

  private async reconnectWithNewSettings() {
    if (!this.isInVoice) return
    const wasMuted = this.isMuted
    this.leaveVoice()
    await this.joinVoice()
    if (!wasMuted) {
      this.setMuted(false)
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

  // ——— VAD (Voice Activity Detection) ———

  // RMS-based VAD for remote peers with hysteresis
  private startRemoteVAD() {
    if (this.vadIntervalId) return

    this.vadIntervalId = setInterval(() => {
      let changed = false

      for (const [userId, conn] of this.peers) {
        conn.analyser.getFloatTimeDomainData(conn.vadBuffer)

        // Calculate RMS (true signal power)
        let sumSquares = 0
        for (let i = 0; i < conn.vadBuffer.length; i++) {
          sumSquares += conn.vadBuffer[i] * conn.vadBuffer[i]
        }
        const rms = Math.sqrt(sumSquares / conn.vadBuffer.length)

        // Hysteresis: higher threshold to start, lower to stop
        let isSpeaking: boolean
        if (conn.wasSpeaking) {
          isSpeaking = rms > SILENCE_THRESHOLD
        } else {
          isSpeaking = rms > SPEECH_THRESHOLD
        }

        if (isSpeaking) {
          conn.holdFrames = HOLD_FRAMES
          if (!conn.wasSpeaking) {
            conn.wasSpeaking = true
            this.speakingUsers.add(userId)
            changed = true
          }
        } else {
          if (conn.holdFrames > 0) {
            conn.holdFrames--
          } else if (conn.wasSpeaking) {
            conn.wasSpeaking = false
            this.speakingUsers.delete(userId)
            changed = true
          }
        }
      }

      if (changed) {
        this.emit('speaking-change')
      }
    }, 33) // ~30fps
  }

  // RMS-based VAD for local mic with hysteresis + noise gate control
  private startLocalVAD() {
    if (this.localVadIntervalId || !this.analyserNode) return

    const bufferLength = this.analyserNode.fftSize
    const dataArray = new Float32Array(bufferLength)

    this.localVadHoldFrames = 0
    this.localWasSpeaking = false

    this.localVadIntervalId = setInterval(() => {
      if (!this.analyserNode || this.isMuted) {
        if (this.localWasSpeaking) {
          this.localWasSpeaking = false
          this.localVadHoldFrames = 0
          this.speakingUsers.delete(this.socket.id!)
          this.emit('speaking-change')
          // Close noise gate
          this.rampNoiseGate(NOISE_GATE_FLOOR, 0.08)
        }
        return
      }

      this.analyserNode.getFloatTimeDomainData(dataArray)

      // Calculate RMS
      let sumSquares = 0
      for (let i = 0; i < bufferLength; i++) {
        sumSquares += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sumSquares / bufferLength)

      // Hysteresis: higher threshold to start, lower to stop
      let isSpeaking: boolean
      if (this.localWasSpeaking) {
        isSpeaking = rms > SILENCE_THRESHOLD
      } else {
        isSpeaking = rms > SPEECH_THRESHOLD
      }

      if (isSpeaking) {
        this.localVadHoldFrames = HOLD_FRAMES
        if (!this.localWasSpeaking) {
          this.localWasSpeaking = true
          this.speakingUsers.add(this.socket.id!)
          this.emit('speaking-change')
          // Open noise gate — fast 10ms attack
          this.rampNoiseGate(1.0, 0.01)
        }
      } else {
        if (this.localVadHoldFrames > 0) {
          this.localVadHoldFrames--
        } else if (this.localWasSpeaking) {
          this.localWasSpeaking = false
          this.speakingUsers.delete(this.socket.id!)
          this.emit('speaking-change')
          // Close noise gate — 80ms release to comfort noise floor
          this.rampNoiseGate(NOISE_GATE_FLOOR, 0.08)
        }
      }
    }, 33) // ~30fps
  }

  private rampNoiseGate(target: number, duration: number) {
    if (!this.noiseGateGain || !this.audioContext) return
    const now = this.audioContext.currentTime
    this.noiseGateGain.gain.cancelScheduledValues(now)
    this.noiseGateGain.gain.setValueAtTime(this.noiseGateGain.gain.value, now)
    this.noiseGateGain.gain.linearRampToValueAtTime(target, now + duration)
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

  // Returns mic input level 0-100 using RMS with logarithmic dB scale
  private micLevelData = new Float32Array(new ArrayBuffer(2048 * 4))
  getMicLevel(): number {
    if (!this.analyserNode || !this.isInVoice) return 0
    this.analyserNode.getFloatTimeDomainData(this.micLevelData)

    let sumSquares = 0
    for (let i = 0; i < this.micLevelData.length; i++) {
      sumSquares += this.micLevelData[i] * this.micLevelData[i]
    }
    const rms = Math.sqrt(sumSquares / this.micLevelData.length)

    // Convert to dB and map to 0-100
    if (rms < 0.0001) return 0
    const db = 20 * Math.log10(rms)
    // Map -60dB..0dB → 0..100
    const normalized = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
    return Math.round(normalized)
  }

  // Getters
  getIsMuted() { return this.isMuted }
  getIsInVoice() { return this.isInVoice }
  getLastError() { return this.lastError }
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
