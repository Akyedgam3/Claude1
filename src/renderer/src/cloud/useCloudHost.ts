import { useEffect, useRef } from 'react';
import type { EventItem } from '../../../app/lan';
import { api } from '../api';

// الاتصال عن بعد على الجهاز الرئيسي: بيشتغل بالخلفية طول ما الشركة مفتوحة والخدمة مفعّلة.
// مكتبة Firebase بتنحمّل بس عند الحاجة، فاللي ما عنده الخدمة ما بيتأثر بشي.

export const CLOUD_CHANGED = 'wazn-cloud-changed';

export function useCloudHost(active: boolean, companyName: string, notify: (m: string, k?: 'ok' | 'error') => void): void {
  const name = useRef(companyName);
  name.current = companyName;
  useEffect(() => {
    if (!active) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let run = 0;

    const start = async () => {
      const mine = ++run;
      stop?.();
      stop = null;
      const cfg = await api.cloudHostConfig().catch(() => null);
      if (!cfg || cancelled || mine !== run) return;
      const [{ CloudHost }, { FirestoreTransport }, { cloudRoom }] = await Promise.all([import('../../../cloud/host'), import('../../../cloud/firestore'), import('../../../cloud/code')]);
      if (cancelled || mine !== run) return;
      const host = new CloudHost(new FirestoreTransport(), await cloudRoom(cfg.code), {
        name: () => name.current,
        login: (u, p, d, n) => api.cloudHostLogin(u, p, d, n),
        snapshot: (t) => api.cloudHostSnapshot(t),
        call: (t, m, a) => api.cloudHostCall(t, m, a),
        logout: (t) => api.cloudHostLogout(t),
        fullState: () => api.cloudHostState(),
        backup: (t) => api.cloudHostBackup(t),
        runQueued: (u, p, m, a) => api.cloudHostQueued(u, p, m, a),
      });
      let warned = false;
      host.onError = (m) => {
        console.error('cloud host', m);
        if (!warned) notify(`الاتصال عن بعد: ${m}`, 'error');
        warned = true;
      };
      const offs = [api.on('company:events', (p) => host.push(p as EventItem[])), api.on('company:reset', () => void host.reset().catch((e: Error) => host.onError(e.message)))];
      stop = () => {
        offs.forEach((o) => o());
        host.stop();
      };
      await host.start().catch((e: Error) => host.onError(e.message));
    };

    const restart = () => void start();
    void start();
    window.addEventListener(CLOUD_CHANGED, restart);
    return () => {
      cancelled = true;
      window.removeEventListener(CLOUD_CHANGED, restart);
      stop?.();
    };
  }, [active, notify]);
}
