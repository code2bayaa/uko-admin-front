import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// UKO admin — staff console, single-page app (no SSR) on http://localhost:3001.
// Talks to admin/back-end on :8010 (VITE_ADMIN_API_URL).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), tailwindcss()],
  server: { port: 3001 },
  // components/map.tsx hands maplibre its tile worker through `?worker&url`, which maplibre starts as a module worker.
  worker: { format: 'es' },
})
