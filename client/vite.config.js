import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    pwaAssets: {
      image: 'public/favicon.svg',
      preset: 'minimal-2023'
    },
    manifest: {
      id: '/',
      name: 'Ordini Scout - Gestione Materiale',
      short_name: 'Ordini Scout',
      description: 'Prenotazioni e gestione del materiale scout.',
      lang: 'it',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f5f5f5',
      theme_color: '#285943',
      categories: ['productivity', 'shopping']
    },
    workbox: {
      navigateFallbackDenylist: [/^\/api(?:\/|$)/]
    }
  })],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
