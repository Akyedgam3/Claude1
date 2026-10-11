import { contextBridge, ipcRenderer } from 'electron';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

const EVENTS = ['company:events', 'company:reset', 'company:closed', 'license:changed', 'lan:error'] as const;

// الواجهة لا تصل لأي شيء من النظام إلا عبر هذه الدوال المحددة.
const api = {
  invoke: (channel: string, ...args: unknown[]) => invoke(channel, ...args),
  on: (channel: (typeof EVENTS)[number], fn: (payload: unknown) => void) => {
    if (!EVENTS.includes(channel)) throw new Error('قناة غير معروفة');
    const listener = (_e: unknown, payload: unknown) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

export type MizanApi = typeof api;

contextBridge.exposeInMainWorld('mizan', api);
