// بناء نسخة الموبايل (أندرويد عبر Capacitor): نفس واجهة الكمبيوتر، والكود المشترك بيشتغل على نسخ صغيرة من وحدات node.
import react from '@vitejs/plugin-react';
import { readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };
const shim = (name: string) => resolve(__dirname, `src/mobile/shims/${name}.ts`);
const out = resolve(__dirname, 'www');

// Capacitor بيفتح index.html
const renameEntry = (): Plugin => ({
  name: 'wazn-mobile-index',
  closeBundle() {
    renameSync(resolve(out, 'mobile.html'), resolve(out, 'index.html'));
  },
});

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), renameEntry()],
  define: {
    __MIZAN_TEST_BUILD__: JSON.stringify(process.env['MIZAN_TEST_BUILD'] === '1'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __WAZN_MOBILE__: 'true',
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
    target: 'chrome100',
    minify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { mobile: resolve(__dirname, 'src/renderer/mobile.html') } },
  },
});
