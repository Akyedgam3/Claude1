import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// سر تطبيق Google Drive (مش بـ git، بمجلد keys المستثنى)
const gdriveSecret = (() => {
  const f = resolve(__dirname, 'keys/gdrive-client.json');
  try {
    return existsSync(f) ? String(JSON.parse(readFileSync(f, 'utf8')).clientSecret ?? '') : '';
  } catch {
    return '';
  }
})();

export default defineConfig(({ command }) => {
  const production = command === 'build';
  const testBuild = process.env['MIZAN_TEST_BUILD'] === '1';
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      // نسخة الاختبارات الآلية بتثق بمفتاح التطوير وما بتتصل بالنت؛ نسخة البيع ما فيها هالشي أبداً
      define: { __MIZAN_TEST_BUILD__: JSON.stringify(process.env['MIZAN_TEST_BUILD'] === '1'), __GDRIVE_SECRET__: JSON.stringify(gdriveSecret) },
      build: {
        minify: production,
        sourcemap: false,
        rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        minify: production,
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/preload/index.ts') },
          // النافذة تعمل في وضع sandbox، فيجب أن يكون الـ preload بصيغة CommonJS
          output: { format: 'cjs', entryFileNames: '[name].cjs' },
        },
      },
    },
    renderer: {
      root: resolve(__dirname, 'src/renderer'),
      build: { minify: production, sourcemap: false, rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } } },
      define: { __MIZAN_TEST_BUILD__: JSON.stringify(testBuild) },
      plugins: [
        react(),
        // نسخة الاختبارات بس: السماح بمحاكي Firestore المحلي
        ...(testBuild ? [{ name: 'test-csp', transformIndexHtml: (html: string) => html.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*") }] : []),
      ],
    },
  };
});
