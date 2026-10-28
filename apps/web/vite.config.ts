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
      // Иконите (public/icons/*.png) са рендерирани еднократно от неоновия рисунък
      // върху черен фон; maskable е с поле, за да не реже маската триъгълника. badge-96.png (иконата
      // на известията в лентата на Android) е само най-ярките линии на рисунъка, бели върху прозрачно.
      includeAssets: ['icons/favicon-48.png', 'icons/apple-touch-icon.png'],
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
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // „Сподели → Семейство“ на Android (само за инсталирано PWA): POST multipart, за да носи и снимка. Поема го
        // service worker-ът (src/sw.ts → receiveShare в features/recipe-import/shared-photo.ts): снимката оставя в
        // кеша и отваря /recipes/import?shared=photo, а текст и линк пренасочва към /recipes/import?title=&text=&url=
        // (ImportScreen → importFromShare). Без `tab` в адреса, за да се различава от вътрешната навигация (`?tab=…`),
        // която само попълва полетата.
        share_target: {
          action: '/recipes/import',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'photo', accept: ['image/*'] }],
          },
        },
      },
      // Собственият service worker (src/sw.ts) показва известията (епик Напомняния); кешът е описан в него.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
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
    // По-дълъг от asyncUtilTimeout в setup.ts, за да падне чакането с ясна грешка, а не целият тест.
    testTimeout: 15_000,
    // Без това Vitest връща празен низ за CSS, и за `?raw` (tokens.spec.ts чете токените, touch-targets.spec.ts
    // всички стилове).
    css: { include: [/tokens\.css/, /\.css\?raw$/] },
  },
});
