import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The daemon mounts the panel under a per-install secret path, so the real base is
// unknown at build time. The placeholder is rewritten by the Go static server
// (internal/web/ui.go) in every html/js/css response it serves.
export default defineConfig({
  base: '/__WPDNS_ADMIN_BASE__/ui/',
  plugins: [react()],
  build: {
    outDir: '../web/ui',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
})
