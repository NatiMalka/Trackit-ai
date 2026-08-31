import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest (not generateSW) because Phase 3 merges Firebase Cloud
      // Messaging into this same worker. Two competing service workers on one
      // scope is the classic way to break web push, so we only ever ship one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        id: '/',
        name: 'TrackIt AI — מעקב חבילות חכם',
        short_name: 'TrackIt AI',
        description:
          'מעקב חבילות חכם בעברית. מתרגם את הסטטוס לשפה פשוטה, מזהה חבילות תקועות ומזכיר לאסוף בזמן.',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        background_color: '#0b0e14',
        theme_color: '#0b0e14',
        categories: ['utilities', 'shopping', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'הוספת חבילה',
            short_name: 'הוספה',
            description: 'הוסף מספר מעקב חדש',
            url: '/add',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(rawId) {
          // Normalise separators: module ids use backslashes on Windows, which
          // silently breaks every path matcher below.
          const id = rawId.replace(/\\/g, '/');
          if (!id.includes('node_modules')) return;

          // Split Firebase per product rather than as one blob. Auth, Firestore
          // and App Check are needed at boot; AI, Messaging and Functions are
          // imported lazily and must stay out of the critical path.
          if (/(@firebase|firebase)\/ai\//.test(id)) return 'firebase-ai';
          if (/(@firebase|firebase)\/messaging\//.test(id)) return 'firebase-messaging';
          if (/(@firebase|firebase)\/functions\//.test(id)) return 'firebase-functions';
          if (/(@firebase|firebase)\/firestore\//.test(id)) return 'firebase-firestore';
          if (/(@firebase|firebase)\/auth\//.test(id)) return 'firebase-auth';
          if (/(@firebase|firebase)\/app-check\//.test(id)) return 'firebase-appcheck';
          if (/(@firebase|firebase)\//.test(id)) return 'firebase-core';

          if (/\/(motion|framer-motion)\//.test(id)) return 'motion';
          return 'vendor';
        },
      },
    },
  },
});
