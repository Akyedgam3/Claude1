import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => {
  const production = command === 'build';
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      // نسخة الاختبارات الآلية بتثق بمفتاح التطوير وما بتتصل بالنت؛ نسخة البيع ما فيها هالشي أبداً
      define: { __MIZAN_TEST_BUILD__: JSON.stringify(process.env['MIZAN_TEST_BUILD'] === '1') },
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
      plugins: [react()],
    },
  };
});
