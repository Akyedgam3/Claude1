import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

const production = process.env['NODE_ENV'] === 'production';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
});
