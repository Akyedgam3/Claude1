// بناء نسخة الموبايل (أندرويد عبر Capacitor): نفس واجهة الكمبيوتر، والكود المشترك بيشتغل على نسخ صغيرة من وحدات node.
import react from '@vitejs/plugin-react';
import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };
const shim = (name: string) => resolve(__dirname, `src/mobile/shims/${name}.ts`);
// WAZN_WEB=1: نسخة الويب للآيفون (اتصال عن بعد بس) بـ web-dist، وبتنرفع على الموقع ← app/
const WEB = process.env['WAZN_WEB'] === '1';
const out = resolve(__dirname, WEB ? 'web-dist' : 'www');

// Capacitor بيفتح index.html
const renameEntry = (): Plugin => ({
  name: 'wazn-mobile-index',
  closeBundle() {
    renameSync(resolve(out, 'mobile.html'), resolve(out, 'index.html'));
    if (WEB) writeWebFiles();
  },
});

// الآيفون: «إضافة إلى الشاشة الرئيسية» بتفتحه متل التطبيق. بدون service worker حتى ما يعلق على نسخة قديمة.
// بدون start_url: الأيقونة بتفتح نفس الرابط اللي انضاف منه (مع رمز الاتصال إذا انفتح من QR).
const webHead = [
  '<link rel="manifest" href="./manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="./icon-180.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="وزن" />',
].join('\n    ');
const webHtml = (): Plugin => ({
  name: 'wazn-web-head',
  transformIndexHtml: (html) => (WEB ? html.replace('</head>', `    ${webHead}\n  </head>`) : html),
});

function writeWebFiles() {
  for (const size of [180, 192, 512]) copyFileSync(resolve(__dirname, `build/web/icon-${size}.png`), resolve(out, `icon-${size}.png`));
  const manifest = {
    name: 'وزن',
    short_name: 'وزن',
    description: 'وزن: الاتصال عن بعد ببيانات المحل',
    lang: 'ar',
    dir: 'rtl',
    display: 'standalone',
    background_color: '#0b2d27',
    theme_color: '#12302b',
    icons: [192, 512].map((s) => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png' })),
  };
  writeFileSync(resolve(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), webHtml(), renameEntry()],
  define: {
    __MIZAN_TEST_BUILD__: JSON.stringify(process.env['MIZAN_TEST_BUILD'] === '1'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __WAZN_MOBILE__: 'true',
    __WAZN_WEB__: JSON.stringify(WEB),
  },
  resolve: {
    alias: [
      { find: /^node:fs$/, replacement: shim('fs') },
      { find: /^node:os$/, replacement: shim('os') },
      { find: /^node:crypto$/, replacement: shim('crypto') },
      { find: /^node:child_process$/, replacement: shim('child_process') },
      { find: /^node:path$/, replacement: 'path-browserify' },
    ],
  },
  server: { fs: { allow: [resolve(__dirname)] } },
  build: {
    outDir: out,
    emptyOutDir: true,
    target: WEB ? ['chrome100', 'safari15'] : 'chrome100',
    minify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { mobile: resolve(__dirname, 'src/renderer/mobile.html') } },
  },
});
