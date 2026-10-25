import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// En dev, /api (et /collab en WebSocket) sont relayés vers VITE_URL_API si défini.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cible = env.VITE_URL_API
  return {
    plugins: [react()],
    server: cible
      ? { proxy: { '/api': { target: cible, changeOrigin: true } } }
      : undefined,
  }
})
