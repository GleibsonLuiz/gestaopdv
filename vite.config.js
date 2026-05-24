import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ETAPA#1: PWA habilitado pra permitir instalacao do modulo de Inventario
// no celular (rota ?mobile=inventario). Service Worker cacheia assets +
// fallback offline. Demais telas seguem funcionando como SPA normal.
//
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GestãoPRO — Inventário Mobile',
        short_name: 'GestãoPRO',
        description: 'Inventário móvel com contagem cega e leitura de código de barras.',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/?mobile=inventario',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // Nao cacheia chamadas a /api ou /uploads do backend — sempre rede.
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
})
