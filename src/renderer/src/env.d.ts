/// <reference types="vite/client" />
import type { MizanApi } from '../../preload';

declare global {
  /** true بنسخة الموبايل بس (vite.mobile.config.ts). */
  const __WAZN_MOBILE__: boolean | undefined;
  interface Window {
    mizan: MizanApi;
  }
}
