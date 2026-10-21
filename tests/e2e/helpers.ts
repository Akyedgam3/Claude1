import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { issueLicense, type Plan } from '../../src/license/license';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const devKey = fs.readFileSync(path.join(root, 'dev-keys/license-private.dev.pem'), 'utf8');

export interface Launched {
  app: ElectronApplication;
  page: Page;
  home: string;
  close: () => Promise<void>;
}

/** يشغّل البرنامج بمجلد مستخدم مستقل (كأنه جهاز جديد). */
export async function launch(opts: { home?: string; feedUrl?: string } = {}): Promise<Launched> {
  const home = opts.home ?? fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-e2e-'));
  const app = await electron.launch({
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), root],
    cwd: root,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData'),
      XDG_CONFIG_HOME: path.join(home, '.config'),
      ...(opts.feedUrl ? { MIZAN_FEED_URL: opts.feedUrl } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 860 });
  // الجولة التعريفية بتغطي الشاشة؛ الاختبارات بتطفيها (عدا اختبار الجولة نفسها)
  await page.evaluate(() => localStorage.setItem('mizan.tour.off', '1'));
  // نوافذ الحفظ تُستبدل بمسارات داخل مجلد الاختبار، والطباعة لا تفتح نافذة الطابعة
  await app.evaluate(({ dialog, BrowserWindow }, dir) => {
    let n = 0;
    dialog.showSaveDialog = (async (_w: unknown, o: { defaultPath?: string }) => ({ canceled: false, filePath: `${dir}/export-${++n}-${(o?.defaultPath ?? 'f').split(/[\\/]/).pop()}` })) as never;
    for (const w of BrowserWindow.getAllWindows()) {
      (w.webContents as unknown as { print: (o: unknown, cb?: (ok: boolean) => void) => void }).print = (_o, cb) => cb?.(true);
    }
  }, home);
  return {
    app,
    page,
    home,
    close: async () => {
      await app.close().catch(() => undefined);
    },
  };
}

export function licenseFor(machineId: string, plan: Plan = 'annual', extra: { id?: string; devices?: number } = {}): string {
  return issueLicense({ customer: 'محل الاختبار', machineId, plan, ...extra }, devKey);
}

/** يفعّل البرنامج من شاشة القفل بمفتاح صادر لبصمة هذا الجهاز. */
export async function activate(page: Page, extra: { id?: string } = {}): Promise<void> {
  await expect(page.getByText('بصمة الجهاز', { exact: true })).toBeVisible();
  const machineId = (await page.locator('.big-code').first().innerText()).trim();
  await page.locator('textarea').fill(licenseFor(machineId, 'annual', extra));
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await expect(page.getByText('شركة جديدة')).toBeVisible();
}

/** إنشاء شركة جديدة من شاشة البداية حتى لوحة التحكم. */
export async function createCompany(page: Page, o: { name: string; activity: string; username?: string; password?: string }): Promise<string> {
  await page.getByRole('button', { name: 'شركة جديدة' }).click();
  await page.locator('.activity', { hasText: o.activity }).click();
  await page.locator('.field', { hasText: 'اسم الشركة' }).locator('input').fill(o.name);
  await page.locator('.field', { hasText: 'اسمك' }).locator('input').fill('المالك');
  await page.locator('.field', { hasText: 'اسم الدخول' }).locator('input').fill(o.username ?? 'admin');
  await page.locator('.field', { hasText: 'كلمة السر (6' }).locator('input').fill(o.password ?? 'secret123');
  await page.locator('.field', { hasText: 'تأكيد كلمة السر' }).locator('input').fill(o.password ?? 'secret123');
  await page.getByRole('button', { name: 'إنشاء الشركة' }).click();
  const code = (await page.locator('.modal .big-code').innerText()).trim();
  await page.getByRole('button', { name: 'حفظته، تابع' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  return code;
}

export async function nav(page: Page, label: string): Promise<void> {
  await page.locator('.sidebar nav button', { hasText: label }).first().click();
}

/** يختار من قائمة البحث (Picker). */
export async function pick(page: Page, input: ReturnType<Page['locator']>, text: string): Promise<void> {
  await input.click();
  await input.fill(text);
  await page.locator('.picker-list li').first().waitFor();
  await input.press('Enter');
}

export async function toast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('.toast').filter({ hasText: text }).last()).toBeVisible();
}

/** ينتظر ظهور ملف بامتداد معيّن في مجلد (بعد التصدير). */
export async function waitForFile(dir: string, ext: string, timeoutMs = 15_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = fs.readdirSync(dir).find((x) => x.endsWith(ext));
    if (f && fs.statSync(path.join(dir, f)).size > 0) return path.join(dir, f);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`لم يُنشأ ملف ${ext}`);
}
