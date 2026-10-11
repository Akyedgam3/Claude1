import { defineConfig } from '@playwright/test';

// اختبارات واجهة كاملة على البرنامج الحقيقي (Electron). شغّل أولاً: npm run build
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: 'test-results',
});
