import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-Origin-Isolation headers so ffmpeg.wasm can use SharedArrayBuffer
// (needed by the multi-threaded core; harmless for the single-thread core).
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  // Keep the large ffmpeg core out of dependency pre-bundling.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: {
    format: 'es',
  },
})
