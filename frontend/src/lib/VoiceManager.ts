import type { types as mediasoupTypes } from 'mediasoup-client'
import type { Socket } from 'socket.io-client'

type Transport = mediasoupTypes.Transport
type Producer = mediasoupTypes.Producer
type Consumer = mediasoupTypes.Consumer

// ——— Quality Presets ———

export type AudioQualityPreset = 'low' | 'medium' | 'high' | 'ultra'

interface AudioQualityConfig {
  label: string
  bitrate: number
  channelCount: number
  opusParams: Record<string, number>
  ptime: number
}

export const AUDIO_QUALITY_PRESETS: Record<AudioQualityPreset, AudioQualityConfig> = {
  low: {
    label: 'Low',
    bitrate: 32_000,
    channelCount: 1,
    opusParams: {
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
    opusParams: {
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
    opusParams: {
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
    opusParams: {
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

// ——— Consumer Entry (replaces PeerConnection) ———

interface ConsumerEntry {
  consumer: Consumer
  socketId: string
  audioEl: HTMLAudioElement // silent element to activate Chrome's WebRTC media pipeline
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
  private device: mediasoupTypes.Device | null = null
  private sendTransport: Transport | null = null
  private recvTransport: Transport | null = null
  private producer: Producer | null = null
  private consumers = new Map<string, ConsumerEntry>() // keyed by consumer.id
  private producerToSocket = new Map<string, string>() // producerId -> socketId

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
    this.socket.on('voice:user-joined' as string, (data: { userId: string }) => {
      this.voiceUsers.add(data.userId)
      this.emit('voice-users-change')
    })

    this.socket.on('voice:user-left' as string, (data: { userId: string }) => {
      this.voiceUsers.delete(data.userId)
      this.speakingUsers.delete(data.userId)
      this.emit('voice-users-change')
      this.emit('speaking-change')
      this.emit('voice-state-change')
    })

    this.socket.on('voice:new-producer' as string, (data: { socketId: string; producerId: string }) => {
      if (!this.isInVoice || !this.device) return
      this.consumeProducer(data.socketId, data.producerId).catch((err) => {
        console.error('[voice] consumeProducer failed:', err)
      })
    })

    this.socket.on('voice:producer-closed' as string, (data: { socketId: string; producerId: string }) => {
      // Find and destroy consumers for this producer
      for (const [consumerId, entry] of this.consumers) {
        if (entry.consumer.producerId === data.producerId) {
          this.destroyConsumer(consumerId)
          break
        }
      }
    })
  }

  async joinVoice() {
    if (this.isInVoice) return
    this.lastError = null

    const config = AUDIO_QUALITY_PRESETS[this.settings.audioQuality]

    try {
      // Create AudioContext first, then getUserMedia — ensures sample rates match
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

      // Use processed stream for mediasoup
      this.processedStream = this.processedStreamDest.stream

      // Start muted — only disable source tracks; processedStream stays enabled
      // so mediasoup keeps the track alive, and the pipeline just receives silence
      this.isMuted = true
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = false))

      this.isInVoice = true
      this.voiceUsers.add(this.socket.id!)

      // Join room on server — get router RTP capabilities + existing producers
      const { rtpCapabilities, existingProducers } = await new Promise<{
        rtpCapabilities: unknown
        existingProducers: { socketId: string; producerId: string }[]
      }>((resolve) => {
        this.socket.emit('voice:join' as string, (response: { rtpCapabilities: unknown; existingProducers: { socketId: string; producerId: string }[] }) => {
          resolve(response)
        })
      })

      // Create mediasoup Device and load router capabilities
      const mediasoupClient = await import('mediasoup-client')
      this.device = new mediasoupClient.Device()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.device.load({ routerRtpCapabilities: rtpCapabilities as any })

      // Create send transport
      await this.createSendTransport()

      // Produce audio
      if (this.sendTransport && this.processedStream) {
        const audioTrack = this.processedStream.getAudioTracks()[0]
        this.producer = await this.sendTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: config.opusParams.stereo === 1 ? true : false,
            opusFec: config.opusParams.useinbandfec === 1 ? true : false,
            opusDtx: config.opusParams.usedtx === 1 ? true : false,
            opusMaxPlaybackRate: 48000,
            opusPtime: config.ptime,
          },
          encodings: [{ maxBitrate: config.bitrate }],
        })
        // Start paused (muted)
        this.producer.pause()
      }

      // Create recv transport
      await this.createRecvTransport()

      // Consume existing producers
      for (const { socketId, producerId } of existingProducers) {
        await this.consumeProducer(socketId, producerId)
      }

      this.startLocalVAD()

      if (this.settings.pushToTalk) {
        this.bindPTT()
      }

      this.emit('voice-state-change')
      this.emit('muted-change')
    } catch (err) {
      console.error('[voice] joinVoice failed:', err)
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
      this.producer?.close()
      this.producer = null
      this.sendTransport?.close()
      this.sendTransport = null
      this.recvTransport?.close()
      this.recvTransport = null
      this.device = null
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

  private async createSendTransport() {
    const params = await new Promise<{
      id: string
      iceParameters: unknown
      iceCandidates: unknown
      dtlsParameters: unknown
    } | null>((resolve) => {
      this.socket.emit('voice:create-send-transport' as string, (response: { id: string; iceParameters: unknown; iceCandidates: unknown; dtlsParameters: unknown } | null) => {
        resolve(response)
      })
    })

    if (!params || !this.device) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.sendTransport = this.device.createSendTransport({
      ...(params as any),
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    this.sendTransport.on('connectionstatechange', (state: string) => {
      console.log(`[voice] sendTransport connectionState: ${state}`)
    })

    this.sendTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: mediasoupTypes.DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
        this.socket.emit(
          'voice:connect-transport' as string,
          { transportId: this.sendTransport!.id, dtlsParameters },
          (response: { connected: boolean }) => {
            if (response.connected) callback()
            else errback(new Error('Transport connect failed'))
          }
        )
      }
    )

    this.sendTransport.on(
      'produce',
      ({ kind, rtpParameters }: { kind: mediasoupTypes.MediaKind; rtpParameters: mediasoupTypes.RtpParameters; appData: mediasoupTypes.AppData }, callback: ({ id }: { id: string }) => void, errback: (error: Error) => void) => {
        this.socket.emit(
          'voice:produce' as string,
          { kind, rtpParameters },
          (response: { producerId: string | null }) => {
            if (response.producerId) callback({ id: response.producerId })
            else errback(new Error('Produce failed'))
          }
        )
      }
    )
  }

  private async createRecvTransport() {
    const params = await new Promise<{
      id: string
      iceParameters: unknown
      iceCandidates: unknown
      dtlsParameters: unknown
    } | null>((resolve) => {
      this.socket.emit('voice:create-recv-transport' as string, (response: { id: string; iceParameters: unknown; iceCandidates: unknown; dtlsParameters: unknown } | null) => {
        resolve(response)
      })
    })

    if (!params || !this.device) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recvTransport = this.device.createRecvTransport({
      ...(params as any),
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    this.recvTransport.on('connectionstatechange', (state: string) => {
      console.log(`[voice] recvTransport connectionState: ${state}`)
    })

    this.recvTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: mediasoupTypes.DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
        this.socket.emit(
          'voice:connect-transport' as string,
          { transportId: this.recvTransport!.id, dtlsParameters },
          (response: { connected: boolean }) => {
            if (response.connected) callback()
            else errback(new Error('Transport connect failed'))
          }
        )
      }
    )
  }

  private async consumeProducer(socketId: string, producerId: string) {
    if (!this.device || !this.recvTransport) {
      console.warn('[voice] consumeProducer: no device or recvTransport')
      return
    }

    this.producerToSocket.set(producerId, socketId)

    const consumerParams = await new Promise<{
      id: string
      producerId: string
      kind: string
      rtpParameters: unknown
    } | null>((resolve) => {
      this.socket.emit(
        'voice:consume' as string,
        { producerId, rtpCapabilities: this.device!.rtpCapabilities },
        (response: { id: string; producerId: string; kind: string; rtpParameters: unknown } | null) => {
          resolve(response)
        }
      )
    })

    if (!consumerParams) {
      console.warn('[voice] consumeProducer: server returned null')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consumer = await this.recvTransport.consume(consumerParams as any)

    // Resume consumer on server FIRST (it starts paused) so media flows before we set up audio
    await new Promise<void>((resolve) => {
      this.socket.emit(
        'voice:resume-consumer' as string,
        { consumerId: consumer.id },
        () => resolve()
      )
    })

    const stream = new MediaStream([consumer.track])

    // Ensure AudioContext is running (it was unlocked during joinVoice user gesture)
    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume()
    }

    // Chrome/Edge need an Audio element attached to the stream to activate
    // the WebRTC media pipeline (MediaStreamAudioSourceNode alone won't trigger
    // RTP decoding). Keep it at volume 0 — actual playback goes through AudioContext.
    const audioEl = new Audio()
    audioEl.srcObject = stream
    audioEl.volume = 0
    audioEl.play().catch(() => {
      // Firefox may block autoplay — that's fine, AudioContext handles playback
    })

    const analyser = this.audioContext!.createAnalyser()
    analyser.fftSize = 2048
    const gainNode = this.audioContext!.createGain()
    gainNode.gain.value = this.settings.outputVolume / 100

    const entry: ConsumerEntry = {
      consumer,
      socketId,
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
    this.consumers.set(consumer.id, entry)

    // Build Web Audio chain: Source → HighPass → Compressor → Gain → Destination + Analyser
    // AudioContext was unlocked during joinVoice user gesture, so playback works
    // even when consume is triggered later by voice:new-producer (no user gesture)
    try {
      const source = this.audioContext!.createMediaStreamSource(stream)
      entry.sourceNode = source

      // Output high-pass filter (60Hz) — protects from pops and rumble
      const outputHP = this.audioContext!.createBiquadFilter()
      outputHP.type = 'highpass'
      outputHP.frequency.value = 60
      outputHP.Q.value = 0.707
      entry.outputHighPass = outputHP

      // Output compressor — prevents volume spikes
      const outputComp = this.audioContext!.createDynamicsCompressor()
      outputComp.threshold.value = -20
      outputComp.ratio.value = 3
      outputComp.knee.value = 10
      outputComp.attack.value = 0.003
      outputComp.release.value = 0.15
      entry.outputCompressor = outputComp

      source.connect(outputHP)
      outputHP.connect(outputComp)
      outputComp.connect(gainNode)
      gainNode.connect(analyser) // for VAD
      gainNode.connect(this.audioContext!.destination) // for actual playback

    } catch (e) {
      console.error('[voice] Failed to setup audio processing for consumer:', e)
    }

    this.startRemoteVAD()
  }

  private destroyConsumer(consumerId: string) {
    const entry = this.consumers.get(consumerId)
    if (!entry) return

    try {
      entry.sourceNode?.disconnect()
      entry.outputHighPass?.disconnect()
      entry.outputCompressor?.disconnect()
      entry.gainNode.disconnect()
      entry.analyser.disconnect()
      entry.consumer.close()
      entry.audioEl.pause()
      entry.audioEl.srcObject = null
    } catch {
      // Ignore cleanup errors
    }

    // Clean up speaking state
    this.speakingUsers.delete(entry.socketId)

    // Clean up producer->socket mapping
    this.producerToSocket.delete(entry.consumer.producerId)

    this.consumers.delete(consumerId)
  }

  leaveVoice() {
    if (!this.isInVoice) return

    this.socket.emit('voice:leave' as string)

    // Close all consumers
    for (const [consumerId] of this.consumers) {
      this.destroyConsumer(consumerId)
    }

    // Close producer
    this.producer?.close()
    this.producer = null

    // Close transports
    this.sendTransport?.close()
    this.sendTransport = null
    this.recvTransport?.close()
    this.recvTransport = null

    // Clear device
    this.device = null
    this.producerToSocket.clear()

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

  setMuted(muted: boolean) {
    if (!this.isInVoice) return
    // If push-to-talk is enabled, don't allow manual unmute
    if (this.settings.pushToTalk && !muted) return

    this.isMuted = muted
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))

    // Pause/resume producer on server to avoid forwarding silent audio
    if (muted) {
      this.producer?.pause()
      this.socket.emit('voice:pause-producer' as string)
    } else {
      this.producer?.resume()
      this.socket.emit('voice:resume-producer' as string)
    }

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
    // Find consumer entry for this userId
    for (const [, entry] of this.consumers) {
      if (entry.socketId === userId) {
        entry.gainNode.gain.value = volume / 100
      }
    }
  }

  setOutputVolume(volume: number) {
    this.settings.outputVolume = volume
    for (const [, entry] of this.consumers) {
      entry.gainNode.gain.value = volume / 100
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
      this.producer?.pause()
      this.socket.emit('voice:pause-producer' as string)
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
      this.producer?.resume()
      this.socket.emit('voice:resume-producer' as string)
      this.emit('muted-change')
    }
  }

  private handlePTTUp = (e: KeyboardEvent) => {
    if (!this.isInVoice || !this.settings.pushToTalk) return
    if (e.key === this.settings.pushToTalkKey) {
      this.pttKeyDown = false
      this.isMuted = true
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      this.producer?.pause()
      this.socket.emit('voice:pause-producer' as string)
      this.emit('muted-change')
    }
  }

  private handlePTTBlur = () => {
    if (this.pttKeyDown) {
      this.pttKeyDown = false
      this.isMuted = true
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
      this.producer?.pause()
      this.socket.emit('voice:pause-producer' as string)
      this.emit('muted-change')
    }
  }

  // ——— VAD (Voice Activity Detection) ———

  // RMS-based VAD for remote consumers with hysteresis
  private startRemoteVAD() {
    if (this.vadIntervalId) return

    this.vadIntervalId = setInterval(() => {
      let changed = false

      for (const [, entry] of this.consumers) {
        entry.analyser.getFloatTimeDomainData(entry.vadBuffer)

        // Calculate RMS (true signal power)
        let sumSquares = 0
        for (let i = 0; i < entry.vadBuffer.length; i++) {
          sumSquares += entry.vadBuffer[i] * entry.vadBuffer[i]
        }
        const rms = Math.sqrt(sumSquares / entry.vadBuffer.length)

        // Hysteresis: higher threshold to start, lower to stop
        let isSpeaking: boolean
        if (entry.wasSpeaking) {
          isSpeaking = rms > SILENCE_THRESHOLD
        } else {
          isSpeaking = rms > SPEECH_THRESHOLD
        }

        if (isSpeaking) {
          entry.holdFrames = HOLD_FRAMES
          if (!entry.wasSpeaking) {
            entry.wasSpeaking = true
            this.speakingUsers.add(entry.socketId)
            changed = true
          }
        } else {
          if (entry.holdFrames > 0) {
            entry.holdFrames--
          } else if (entry.wasSpeaking) {
            entry.wasSpeaking = false
            this.speakingUsers.delete(entry.socketId)
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
  getPeerCount() { return this.consumers.size }

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
    this.socket.off('voice:user-joined' as string)
    this.socket.off('voice:user-left' as string)
    this.socket.off('voice:new-producer' as string)
    this.socket.off('voice:producer-closed' as string)
    this.listeners.clear()
  }
}
