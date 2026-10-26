import { expect, test } from '@playwright/test';
import { launch } from './helpers';

// التفعيل بكود قصير من لوحة الإدارة على النت. بيحتاج اللوحة شغالة محلياً بمفتاح التطوير:
// cd panel && npx wrangler dev --port 8787 (وحساب مدير owner / StrongPass123 ومفتاح التطوير مرفوع)، ثم PANEL_URL=http://127.0.0.1:8787
const PANEL = process.env['PANEL_URL'];

async function ownerCard(body: Record<string, unknown>): Promise<{ code: string }> {
  const login = await fetch(`${PANEL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1' }, body: JSON.stringify({ username: 'owner', password: 'StrongPass123' }) });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
  const r = await fetch(`${PANEL}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wazn': '1', Cookie: cookie }, body: JSON.stringify(body) });
  expect(r.ok).toBe(true);
  return r.json() as Promise<{ code: string }>;
}

test('activation with a short code from the online panel', async () => {
  test.skip(!PANEL, 'needs the panel running locally (PANEL_URL)');
  process.env['MIZAN_REDEEM_URL'] = `${PANEL}/api/redeem`;
  const card = await ownerCard({ name: 'محل بالكود', plan: 'annual', devices: 2 });
  const a = await launch();
  try {
    const p = a.page;
    await expect(p.getByText('بصمة الجهاز', { exact: true })).toBeVisible();
    await p.locator('textarea').fill('ABCD-EFGH-JKMN-PQRS');
    await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await expect(p.locator('.toast.error')).toContainText('الكود غلط');
    // الكود بأحرف صغيرة وبدون شحطات بيمشي كمان
    await p.locator('textarea').fill(card.code.replace(/-/g, ' ').toLowerCase());
    await p.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await expect(p.getByText('شركة جديدة')).toBeVisible({ timeout: 20000 });
    await expect(p.getByText('مرخّص لـ محل بالكود')).toBeVisible();
    // نفس الكرت على جهاز تاني (بصمة تانية): مستعمل
    const other = await fetch(`${PANEL}/api/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: card.code, machineIds: ['ABCD-ABCD-ABCD-ABCD'] }) });
    expect(other.status).toBe(400);
    expect(((await other.json()) as { error: string }).error).toContain('انستعمل');
  } finally {
    delete process.env['MIZAN_REDEEM_URL'];
    await a.close();
  }
});
