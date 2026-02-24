import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { execSync } from 'child_process'

const commitHash = (() => {
  try { return execSync('git rev-parse --short=6 HEAD').toString().trim() }
  catch { return process.env.COMMIT_HASH || 'unknown' }
})()

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: { Buffer: true, process: true },
    }),
  ],
  optimizeDeps: {
    exclude: ['@sapphi-red/web-noise-suppressor'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
})
