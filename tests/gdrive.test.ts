import { describe, expect, it } from 'vitest';
import { packBackup, unpackBackup } from '../src/app/backup-pack';
import { DriveAuthError, DriveClient, driveAuthUrl, exchangeCode, pkcePair, refreshTokens, type DriveFetch } from '../src/app/gdrive';

/** Google Drive وهمي بالذاكرة: بيفهم الطلبات اللي منبعتها بس. */
function fakeDrive() {
  type F = { id: string; name: string; mimeType: string; parents?: string[]; appProperties?: Record<string, string>; data?: Uint8Array; createdTime: string; trashed?: boolean };
  const files = new Map<string, F>();
  let n = 0;
  let clock = Date.parse('2026-11-07T10:00:00Z');
  const calls: string[] = [];
  const tokens = { valid: new Set(['A1']), refreshOk: true };
  const res = (status: number, body: unknown) => ({
    ok: status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => (body instanceof Uint8Array ? (body.slice().buffer as ArrayBuffer) : new ArrayBuffer(0)),
  });
  const matches = (f: F, q: string) => {
    if (f.trashed) return false;
    const name = /name='([^']+)'/.exec(q);
    if (name && f.name !== name[1]) return false;
    if (q.includes("mimeType='application/vnd.google-apps.folder'") && f.mimeType !== 'application/vnd.google-apps.folder') return false;
    for (const m of q.matchAll(/appProperties has \{ key='(\w+)' and value='([^']*)' \}/g)) if (f.appProperties?.[m[1]!] !== m[2]) return false;
    return true;
  };
  const fetch: DriveFetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    calls.push(`${method} ${u.pathname}`);
    if (u.host === 'oauth2.googleapis.com') {
      const p = new URLSearchParams(String(init.body));
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') !== 'CODE' || !p.get('code_verifier')) return res(400, { error: 'invalid_grant' });
        return res(200, { access_token: 'A1', expires_in: 3600, refresh_token: 'R1' });
      }
      if (!tokens.refreshOk) return res(400, { error: 'invalid_grant' });
      tokens.valid.add('A2');
      return res(200, { access_token: 'A2', expires_in: 3600 });
    }
    const auth = init.headers?.Authorization?.replace('Bearer ', '');
    if (!auth || !tokens.valid.has(auth)) return res(401, { error: { message: 'unauth' } });
    if (u.pathname === '/drive/v3/about') return res(200, { user: { emailAddress: 'shop@gmail.com', displayName: 'أبو محمد' } });
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      const list = [...files.values()].filter((f) => matches(f, q)).sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
      return res(200, { files: list.map((f) => ({ id: f.id, name: f.name, size: String(f.data?.length ?? 0), createdTime: f.createdTime, appProperties: f.appProperties })) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const m = JSON.parse(String(init.body));
      const id = `f${++n}`;
      files.set(id, { id, ...m, createdTime: new Date((clock += 1000)).toISOString() });
      return res(200, { id });
    }
    if (u.pathname === '/upload/drive/v3/files') {
      const body = init.body as Uint8Array;
      const text = new TextDecoder('latin1').decode(body);
      const boundary = /boundary=(\S+)/.exec(init.headers!['Content-Type']!)![1]!;
      const parts = text.split(`--${boundary}`);
      const metaPart = parts[1]!;
      const meta = JSON.parse(new TextDecoder().decode(body.subarray(text.indexOf('{'), text.indexOf('}\r\n--') + 1)));
      const dataStart = text.indexOf('\r\n\r\n', text.indexOf('Content-Type: application/octet-stream')) + 4;
      const dataEnd = text.lastIndexOf(`\r\n--${boundary}--`);
      expect(metaPart).toContain('application/json');
      const id = `f${++n}`;
      const createdTime = new Date((clock += 1000)).toISOString();
      files.set(id, { id, ...meta, data: body.slice(dataStart, dataEnd), createdTime });
      return res(200, { id, name: meta.name, size: String(dataEnd - dataStart), createdTime });
    }
    const one = /^\/drive\/v3\/files\/(.+)$/.exec(u.pathname);
    if (one) {
      const f = files.get(decodeURIComponent(one[1]!));
      if (!f) return res(404, { error: { message: 'not found' } });
      if (method === 'DELETE') {
        files.delete(f.id);
        return res(204, {});
      }
      return res(200, f.data);
    }
    return res(404, {});
  };
  return { fetch, files, calls, tokens };
}

describe('Google Drive', () => {
  it('رابط الدخول بصلاحية drive.file وPKCE، وتبديل الرمز وتجديده', async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier.length).toBeGreaterThan(40);
    const url = new URL(driveAuthUrl({ clientId: 'CID' }, 'http://127.0.0.1:5555', challenge, 'S'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    const d = fakeDrive();
    const t = await exchangeCode(d.fetch, { clientId: 'CID', clientSecret: 'SEC' }, 'CODE', verifier, 'http://127.0.0.1:5555', 1000);
    expect(t).toEqual({ access: 'A1', expires: 1000 + 3600_000, refresh: 'R1' });
    // لسا صالح: ما في طلب جديد
    expect(await refreshTokens(d.fetch, { clientId: 'CID' }, t, 2000)).toBe(t);
    const t2 = await refreshTokens(d.fetch, { clientId: 'CID' }, t, 1000 + 3600_000);
    expect(t2.access).toBe('A2');
    expect(t2.refresh).toBe('R1');
    d.tokens.refreshOk = false;
    await expect(refreshTokens(d.fetch, { clientId: 'CID' }, { ...t2, expires: 0 })).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('رفع نسخة بمجلد «Wazn Backups»، قائمة، تنزيل بنفس البايتات، وحذف الأقدم', async () => {
    const d = fakeDrive();
    const c = new DriveClient(d.fetch, async () => 'A1');
    expect(await c.account()).toEqual({ email: 'shop@gmail.com', name: 'أبو محمد' });
    const bytes = packBackup({ 'company.json': new TextEncoder().encode('{"id":"c1"}'), 'journal.mzl': new Uint8Array([0, 1, 2, 255, 13, 10, 45, 45]), 'keyring.json': new Uint8Array([7]), 'head.json': new Uint8Array([8]) });
    for (let i = 0; i < 5; i++) await c.upload(`Wazn-الخير-${i}.wazn`, bytes, { company: 'c1', companyName: 'سوبرماركت الخير' });
    await c.upload('Wazn-other.wazn', bytes, { company: 'c2', companyName: 'مطعم' });
    // مجلد واحد بس انعمل
    expect([...d.files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder')).toHaveLength(1);
    const mine = await c.list('c1');
    expect(mine).toHaveLength(5);
    expect(mine[0]!.name).toBe('Wazn-الخير-4.wazn');
    expect(mine[0]!.companyName).toBe('سوبرماركت الخير');
    expect(await c.list()).toHaveLength(6);
    const back = await c.download(mine[0]!.id);
    expect(back).toEqual(bytes);
    expect(unpackBackup(back)['journal.mzl']).toEqual(new Uint8Array([0, 1, 2, 255, 13, 10, 45, 45]));
    expect(await c.prune('c1', 2)).toBe(3);
    expect((await c.list('c1')).map((f) => f.name)).toEqual(['Wazn-الخير-4.wazn', 'Wazn-الخير-3.wazn']);
    expect(await c.list('c2')).toHaveLength(1); // الشركة التانية ما انلمست
    expect(await c.prune('c1', 0)).toBe(0); // 0 = خلّي كلها
  });

  it('رمز منتهي بيعطي رسالة «اربطه من جديد»', async () => {
    const d = fakeDrive();
    const c = new DriveClient(d.fetch, async () => 'expired');
    await expect(c.list()).rejects.toBeInstanceOf(DriveAuthError);
  });
});
