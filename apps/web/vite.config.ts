import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Цветовете са --color-accent и --color-bg (светла тема) от src/styles/tokens.css.
const THEME_COLOR = '#0b6e78';
const BACKGROUND_COLOR = '#eef1f8';

// api слуша на 127.0.0.1:API_PORT (по подразбиране 18091), същата променлива като в docker-compose.yml.
const API_PORT = process.env.API_PORT || '18091';

// Версията в „Настройки“: от package.json, с късия git sha, ако build-ът го подаде (GIT_SHA).
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
const APP_VERSION = process.env.GIT_SHA
  ? `${version} (${process.env.GIT_SHA.slice(0, 7)})`
  : version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Иконите (public/icons/*.png) са рендерирани еднократно от icon.svg.
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Семейна платформа',
        short_name: 'Семейство',
        description: 'Календар, бюджет и храна на един екран.',
        lang: 'bg',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Навигация към api/healthz не е страница на приложението.
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/],
        // Фаза 1: /api/* само от мрежата, без кеш.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
        // woff2: Inter (src/styles/fonts.css) трябва да работи офлайн.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@family/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    // Без това Vitest връща празен низ за CSS, и за `?raw` (tokens.spec.ts чете токените).
    css: { include: [/tokens\.css/] },
  },
});
