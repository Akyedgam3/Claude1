/// <reference types="vite/client" />
import type { MizanApi } from '../../preload';

declare global {
  interface Window {
    mizan: MizanApi;
  }
}
