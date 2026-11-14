import type { CapacitorConfig } from '@capacitor/cli';

// تطبيق وزن لأندرويد: نفس واجهة الكمبيوتر (www من vite.mobile.config.ts)، والبيانات كلها على الجوال.
const config: CapacitorConfig = {
  appId: 'com.waznsy.wazn',
  appName: 'وزن',
  webDir: 'www',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: { androidScheme: 'https' },
};

export default config;
