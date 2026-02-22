// RNNoise WASM-based ML noise suppression
// Lazy-loaded only when advancedNoiseSuppression is enabled (~200KB WASM)

const registeredContexts = new WeakSet<AudioContext>()

export async function createRNNoiseNode(ctx: AudioContext): Promise<AudioWorkletNode> {
  // Dynamically import the library — tree-shaken when not used
  const { RnnoiseWorkletNode, loadRnnoise } = await import('@sapphi-red/web-noise-suppressor')

  // Register worklet processor once per AudioContext
  if (!registeredContexts.has(ctx)) {
    const workletUrl = new URL(
      '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js',
      import.meta.url
    ).href
    await ctx.audioWorklet.addModule(workletUrl)
    registeredContexts.add(ctx)
  }

  // Load WASM binary (with SIMD support detection)
  const wasmUrl = new URL(
    '@sapphi-red/web-noise-suppressor/rnnoise.wasm',
    import.meta.url
  ).href
  const simdUrl = new URL(
    '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm',
    import.meta.url
  ).href
  const wasmBinary = await loadRnnoise({ url: wasmUrl, simdUrl: simdUrl })

  return new RnnoiseWorkletNode(ctx, {
    maxChannels: 1,
    wasmBinary,
  })
}
