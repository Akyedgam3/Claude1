import { contextBridge, ipcRenderer } from 'electron';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

const api = {
  info: () => invoke('app:info'),
  activate: (key: string) => invoke('license:activate', key),
  createCompany: (opts: unknown) => invoke('company:create', opts),
  openCompany: (dir?: string) => invoke('company:open', dir),
  closeCompany: () => invoke('company:close'),
  state: () => invoke('company:state'),
  call: (method: string, ...args: unknown[]) => invoke('ledger:call', method, args),
  backup: (toExternal: boolean) => invoke('company:backup', toExternal),
  reveal: () => invoke('company:reveal'),
  print: () => invoke('app:print'),
};

export type MizanApi = typeof api;

contextBridge.exposeInMainWorld('mizan', api);
