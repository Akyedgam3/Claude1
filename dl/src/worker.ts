// رابط تحميل مباشر: Cloudflare بيجيب الملف من آخر Release على mizan-updates وبيوصّله للزبون،
// فالزبون ما بيفتح GitHub أبداً. بيدعم Range (التحميل بيكمّل إذا انقطع النت).
const REPO = 'Akyedgam3/mizan-updates';
const FILES: Record<string, string> = {
  'Wazn-Setup.exe': 'application/vnd.microsoft.portable-executable',
  'Wazn-Setup-32bit.exe': 'application/vnd.microsoft.portable-executable',
  'Wazn.apk': 'application/vnd.android.package-archive',
  'Mizan-Setup.exe': 'application/vnd.microsoft.portable-executable',
  'Miyar-Setup.exe': 'application/vnd.microsoft.portable-executable',
};
const PASS = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];

const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تحميل وزن</title><style>
:root{--g:#0f6e5c;--bg:#f3f5f4;--fg:#10201c;--card:#fff;--mut:#5b6b67}
@media (prefers-color-scheme:dark){:root{--bg:#07130f;--fg:#e8f2ef;--card:#10201c;--mut:#9fb3ad}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,Tahoma,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
main{width:100%;max-width:440px}h1{text-align:center;color:var(--g);font-size:40px;margin:0 0 4px}p{text-align:center;color:var(--mut);margin:0 0 20px}
a{display:block;background:var(--card);border:1.5px solid rgba(15,110,92,.35);border-radius:16px;padding:16px 18px;margin:10px 0;color:inherit;text-decoration:none;font-weight:700}
a small{display:block;font-weight:400;color:var(--mut)}a:first-of-type{background:var(--g);color:#fff;border-color:var(--g)}a:first-of-type small{color:#d6efe8}
</style></head><body><main><h1>وزن</h1><p>تحميل مباشر، بدون VPN</p>
<a href="/Wazn-Setup.exe">ويندوز 64 بت<small>لأغلب الكمبيوترات (ويندوز 10 أو أحدث)</small></a>
<a href="/Wazn-Setup-32bit.exe">ويندوز 32 بت<small>للأجهزة القديمة (ويندوز 10 أو أحدث)</small></a>
<a href="/Wazn.apk">أندرويد<small>تطبيق الجوال</small></a>
<p style="margin-top:18px"><a style="display:inline;border:0;background:none;padding:0;color:var(--g)" href="https://waznsy.com">waznsy.com</a></p>
</main></body></html>`;

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const name = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (name === '' || name === 'index.html') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    if (!FILES[name]) return new Response('Not found', { status: 404 });
    const h = new Headers({ 'user-agent': 'wazn-dl' });
    const range = req.headers.get('range');
    if (range) h.set('range', range);
    const up = await fetch(`https://github.com/${REPO}/releases/latest/download/${name}`, { method: req.method, headers: h, redirect: 'follow' });
    if (!up.ok) return new Response('التحميل مش متاح هلق، جرّب بعد شوي', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const out = new Headers({ 'content-type': FILES[name], 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' });
    for (const k of PASS) {
      const v = up.headers.get(k);
      if (v) out.set(k, v);
    }
    if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
    return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
  },
};
