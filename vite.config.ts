import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const appVersion = pkg.version;

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  optimizeDeps: {
    include: ['three', 'svelte'],
  },
  esbuild: {
    drop: mode === 'production' ? ['debugger'] : [],
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    sourcemap: false,
    /** three vendor chunk is intentionally ~530k minified */
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/svelte')) {
            return 'svelte';
          }
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: 'Civitas',
        short_name: 'Civitas',
        description: 'Roman city builder for the web — offline v0',
        theme_color: '#8b4513',
        background_color: '#c4a574',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: `models-v${appVersion}`,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /\/(icons|textures|audio)\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: `static-v${appVersion}`,
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
    }),
  ],
}));
