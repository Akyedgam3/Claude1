// النسخ الاحتياطي على Google Drive: تسجيل دخول OAuth (PKCE) وصلاحية drive.file بس،
// يعني البرنامج بيشوف بس الملفات اللي هو عملها (ما بيقدر يقرا باقي ملفات الزبون).
// الملفات بمجلد «Wazn Backups»، كل نسخة ملف .wazn واحد (نفس صيغة backup-pack، مشفّر متل ما هو).
// fetch بينحقن حتى ينفع بالكمبيوتر والجوال والاختبارات.

export type DriveFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER = 'Wazn Backups';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveClientConfig {
  clientId: string;
  /** تطبيقات الكمبيوتر بتاخد «سر» مش سري فعلياً (حسب Google)، ومطلوب لتبديل الرمز. */
  clientSecret?: string;
}

export interface DriveTokens {
  access: string;
  /** وقت انتهاء رمز الدخول (ms). */
  expires: number;
  refresh: string;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  company?: string;
  companyName?: string;
}

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** verifier عشوائي و challenge = SHA-256 تبعه (PKCE). */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

export function driveAuthUrl(cfg: DriveClientConfig, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH}?${q}`;
}

async function tokenCall(f: DriveFetch, body: Record<string, string>): Promise<any> {
  const res = await f(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.error === 'invalid_grant') throw new DriveAuthError('انتهت صلاحية ربط Google Drive، اربطه من جديد');
    throw new Error(`Google: ${data?.error_description || data?.error || res.status}`);
  }
  return data;
}

export class DriveAuthError extends Error {}

export async function exchangeCode(f: DriveFetch, cfg: DriveClientConfig, code: string, verifier: string, redirectUri: string, now = Date.now()): Promise<DriveTokens> {
  const d = await tokenCall(f, { code, client_id: cfg.clientId, ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}), code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (!d.refresh_token) throw new Error('Google ما رجّع رمز دائم، جرّب مرة تانية');
  return { access: d.access_token, expires: now + (Number(d.expires_in) || 3600) * 1000, refresh: d.refresh_token };
}

export async function refreshTokens(f: DriveFetch, cfg: DriveClientConfig, t: DriveTokens, now = Date.now()): Promise<DriveTokens> {
  if (t.access && t.expires - 60_000 > now) return t;
  const d = await tokenCall(f, { refresh_token: t.refresh, client_id: cfg.clientId, ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}), grant_type: 'refresh_token' });
  return { access: d.access_token, expires: now + (Number(d.expires_in) || 3600) * 1000, refresh: d.refresh_token || t.refresh };
}

export class DriveClient {
  constructor(
    private readonly f: DriveFetch,
    private readonly token: () => Promise<string>,
  ) {}

  private async call(url: string, init: Parameters<DriveFetch>[1] = {}): Promise<any> {
    const res = await this.f(url, { ...init, headers: { Authorization: `Bearer ${await this.token()}`, ...(init.headers ?? {}) } });
    if (res.status === 401) throw new DriveAuthError('انتهت صلاحية ربط Google Drive، اربطه من جديد');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (res.status === 403 && /storageQuota/i.test(JSON.stringify(d))) throw new Error('مساحة Google Drive ممتلئة');
      throw new Error(`Google Drive: ${d?.error?.message || res.status}`);
    }
    return res;
  }

  async account(): Promise<{ email: string; name: string }> {
    const d = await (await this.call(`${API}/about?fields=user(emailAddress,displayName)`)).json();
    return { email: d.user?.emailAddress ?? '', name: d.user?.displayName ?? '' };
  }

  /** مجلد «Wazn Backups» (بيتعمل إذا مش موجود). */
  async folder(): Promise<string> {
    const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const d = await (await this.call(`${API}/files?q=${q}&fields=files(id)&spaces=drive`)).json();
    if (d.files?.[0]?.id) return d.files[0].id;
    const c = await (await this.call(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).json();
    return c.id;
  }

  async upload(name: string, bytes: Uint8Array, props: { company: string; companyName: string }): Promise<DriveFile> {
    const folder = await this.folder();
    const boundary = `wazn${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [folder], mimeType: 'application/octet-stream', appProperties: { wazn: '1', company: props.company, companyName: props.companyName.slice(0, 100) } });
    const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);
    const d = await (await this.call(`${UPLOAD}?uploadType=multipart&fields=id,name,size,createdTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
    return { id: d.id, name: d.name, size: Number(d.size) || bytes.length, createdTime: d.createdTime, company: props.company, companyName: props.companyName };
  }

  /** نسخ وزن على الدرايف (لشركة معيّنة أو كلها)، الأحدث أول. */
  async list(company?: string): Promise<DriveFile[]> {
    const cond = [`appProperties has { key='wazn' and value='1' }`, 'trashed=false'];
    if (company) cond.push(`appProperties has { key='company' and value='${company.replace(/'/g, '')}' }`);
    const out: DriveFile[] = [];
    let page = '';
    do {
      const url = `${API}/files?q=${encodeURIComponent(cond.join(' and '))}&orderBy=createdTime desc&pageSize=200&fields=nextPageToken,files(id,name,size,createdTime,appProperties)${page ? `&pageToken=${page}` : ''}`;
      const d = await (await this.call(url)).json();
      for (const x of d.files ?? []) out.push({ id: x.id, name: x.name, size: Number(x.size) || 0, createdTime: x.createdTime, company: x.appProperties?.company, companyName: x.appProperties?.companyName });
      page = d.nextPageToken ?? '';
    } while (page);
    return out.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
  }

  async remove(id: string): Promise<void> {
    await this.call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** بيخلي آخر keep نسخة للشركة وبيحذف الأقدم. */
  async prune(company: string, keep: number): Promise<number> {
    if (!(keep > 0)) return 0;
    const old = (await this.list(company)).slice(keep);
    for (const f of old) await this.remove(f.id);
    return old.length;
  }
}
