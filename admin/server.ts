// لوحة إدارة التراخيص (للبائع فقط): npm run admin ثم افتح الرابط الظاهر.
// تعمل على جهازك فقط (127.0.0.1) ولا تحتاج إنترنت.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, type FeedStatus, type Plan } from '../src/license/license';
import { LICENSE_FEED_URLS } from '../src/license/config';
import { IS_DEV_KEY } from '../src/license/public-key';
import { Registry } from './registry';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = fs.existsSync(path.join(root, 'keys/license-private.pem')) ? 'keys/license-private.pem' : 'dev-keys/license-private.dev.pem';
const registry = new Registry(path.join(root, 'keys/registry.json'), fs.readFileSync(path.join(root, keyFile), 'utf8'));
const feedFile = path.join(root, 'keys/feed.txt');
const token = randomBytes(16).toString('hex');
const page = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8').replace('__TOKEN__', token);
const port = Number(process.env['PORT'] ?? 4100);

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) reject(new Error('الطلب كبير'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON غير صالح'));
      }
    });
  });
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

const server = http.createServer(async (req, res) => {
  const send = (status: number, body: unknown, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  try {
    // منع إعادة توجيه نطاق خارجي إلى جهازك (DNS rebinding)
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) return send(403, { error: 'غير مصرح' });
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') return send(200, page, 'text/html; charset=utf-8');
    // حماية من مواقع أخرى تحاول إرسال طلبات للوحة
    if (req.headers['x-admin-token'] !== token) return send(403, { error: 'غير مصرح' });

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return send(200, {
        customers: registry.customers,
        plans: PLANS,
        devKey: IS_DEV_KEY || keyFile.startsWith('dev-keys'),
        feedUrls: LICENSE_FEED_URLS,
        feedFile,
        lastPublished: registry.lastPublished,
      });
    }
    const body = req.method === 'POST' ? await readBody(req) : {};
    const m = /^\/api\/customers\/([^/]+)\/(extend|status|update)$/.exec(url.pathname);
    if (req.method === 'POST' && url.pathname === '/api/customers') {
      const c = registry.add({
        name: str(body['name']) ?? '',
        machineId: str(body['machineId']) ?? '',
        plan: str(body['plan']) as Plan,
        ...(str(body['phone']) ? { phone: str(body['phone'])! } : {}),
        ...(str(body['notes']) ? { notes: str(body['notes'])! } : {}),
        ...(num(body['devices']) ? { devices: num(body['devices'])! } : {}),
        ...(num(body['offlineDays']) ? { offlineDays: num(body['offlineDays'])! } : {}),
      });
      return send(200, c);
    }
    if (req.method === 'POST' && m) {
      const [, id, action] = m;
      if (action === 'extend') return send(200, registry.extend(id!, str(body['plan']) as Plan));
      if (action === 'status') return send(200, registry.setStatus(id!, str(body['status']) as FeedStatus, str(body['message'])));
      return send(
        200,
        registry.update(id!, {
          ...(str(body['name']) ? { name: str(body['name'])! } : {}),
          ...(str(body['phone']) !== undefined ? { phone: str(body['phone'])! } : {}),
          ...(str(body['notes']) !== undefined ? { notes: str(body['notes'])! } : {}),
          ...(str(body['machineId']) ? { machineId: str(body['machineId'])! } : {}),
          ...(num(body['devices']) ? { devices: num(body['devices'])! } : {}),
          ...(num(body['offlineDays']) ? { offlineDays: num(body['offlineDays'])! } : {}),
        }),
      );
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') return send(200, registry.publish(feedFile));
    send(404, { error: 'غير موجود' });
  } catch (e) {
    send(400, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`لوحة إدارة التراخيص: http://127.0.0.1:${port}`);
  if (keyFile.startsWith('dev-keys')) console.warn('تنبيه: يُستخدم مفتاح التطوير. شغّل npm run license:keygen قبل البيع.');
});
