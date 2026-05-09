import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      devOptions: { enabled: false },
      manifest: {
        name: 'anh.naillab POS',
        short_name: 'anh.naillab',
        description: 'Hệ thống POS cho tiệm nail',
        theme_color: '#C9477A',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'vi',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Cache Supabase GET responses briefly so menu/customers load offline,
            // but keep writes, realtime, and mutation-prone tables untouched.
            // Orders/items/payments are excluded so a stale cached list never hides
            // a fresh write from another device.
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('supabase.co') &&
              request.method === 'GET' &&
              !/\/(orders|order_items|order_payments)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-get',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 2 },
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
});
