/// <reference types="vite/client" />
import type { MizanApi } from '../../preload';

declare global {
  /** true بنسخة الموبايل بس (vite.mobile.config.ts). */
  const __WAZN_MOBILE__: boolean | undefined;
  /** true بنسخة الويب (آيفون) بس: WAZN_WEB=1 مع vite.mobile.config.ts. */
  const __WAZN_WEB__: boolean | undefined;
  interface Window {
    mizan: MizanApi;
  }
}
