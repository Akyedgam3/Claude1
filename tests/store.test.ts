import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CURRENCIES, accountBalance, chartFor } from '../src/core';
import { CompanyStore, peekCompany } from '../src/storage/company-store';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const login = { username: 'admin', password: 'secret123' };

function create() {
  return CompanyStore.create(dir, {
    info: { name: 'محل', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    currencies: DEFAULT_CURRENCIES,
    accounts: chartFor('general'),
    owner: { username: 'admin', displayName: 'المالك', password: login.password },
  });
}

const sale = (store: CompanyStore, amount: number) =>
  store.ledger.postEntry({ date: '2026-01-05', memo: 'بيع', lines: [{ accountId: '1101', debit: amount }, { accountId: '4101', credit: amount }] });

describe('CompanyStore (encrypted)', () => {
  it('persists to disk encrypted and reloads with the right password', () => {
    const { store, recoveryCode } = create();
    expect(recoveryCode).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    sale(store, 1500);
    store.close();
    const raw = fs.readFileSync(path.join(dir, 'journal.mzl'), 'utf8') + fs.readFileSync(path.join(dir, 'snapshot.enc'), 'utf8');
    expect(raw).not.toContain('محل');
    // نصوص ما بتطلع بالصدفة جوّا التشفير (base64/hex)، عكس أرقام متل 1101
    expect(raw).not.toContain('بيع');
    expect(raw).not.toContain('"accountId"');
    const reopened = CompanyStore.open(dir, login);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(1500);
    expect(reopened.user.role).toBe('owner');
    reopened.close();
  });

  it('rejects wrong passwords and unknown users', () => {
    create().store.close();
    expect(() => CompanyStore.open(dir, { username: 'admin', password: 'wrong' })).toThrow(/غير صحيحة/);
    expect(() => CompanyStore.open(dir, { username: 'nobody', password: 'secret123' })).toThrow(/غير صحيحة/);
    expect(fs.existsSync(path.join(dir, '.lock'))).toBe(false);
  });

  it('opens with the recovery code and allows setting a new password', () => {
    const { store, recoveryCode } = create();
    store.close();
    const s = CompanyStore.open(dir, { recoveryCode: recoveryCode.toLowerCase().replace(/-/g, ' ') });
    expect(s.viaRecovery).toBe(true);
    s.setPassword(s.user.id, 'newpass99');
    s.close();
    expect(() => CompanyStore.open(dir, login)).toThrow();
    CompanyStore.open(dir, { username: 'admin', password: 'newpass99' }).close();
    expect(() => CompanyStore.open(dir, { recoveryCode: 'AAAA-BBBB' })).toThrow(/الاسترداد/);
  });

  it('manages user passwords and deactivation', () => {
    const { store } = create();
    store.ledger.saveUser({ id: 'u2', username: 'kasher', displayName: 'كاشير', role: 'cashier', active: true });
    store.setPassword('u2', 'cashier1');
    expect(store.verify('KASHER', 'cashier1')?.id).toBe('u2');
    expect(store.verify('kasher', 'nope')).toBeNull();
    expect(peekCompany(dir).usernames.sort()).toEqual(['admin', 'kasher']);
    store.ledger.saveUser({ id: 'u2', username: 'kasher', displayName: 'كاشير', role: 'cashier', active: false });
    store.syncUser('u2');
    store.close();
    expect(() => CompanyStore.open(dir, { username: 'kasher', password: 'cashier1' })).toThrow();
    const s = CompanyStore.open(dir, login);
    expect(s.verify('kasher', 'cashier1')).toBeNull();
    s.close();
  });

  it('reloads from snapshot plus newer journal records after a crash', () => {
    const { store } = create();
    sale(store, 100);
    store.snapshot();
    sale(store, 200);
    fs.rmSync(path.join(dir, '.lock')); // إغلاق مفاجئ
    const reopened = CompanyStore.open(dir, login);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(300);
    reopened.close();
  });

  it('recovers from a half-written last line (power cut)', () => {
    const { store } = create();
    sale(store, 100);
    store.close();
    fs.appendFileSync(path.join(dir, 'journal.mzl'), '{"seq":999,"at":"2026');
    fs.rmSync(path.join(dir, 'snapshot.enc'));
    const reopened = CompanyStore.open(dir, login);
    expect(reopened.recoveredTail).toBe(true);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(100);
    sale(reopened, 50);
    reopened.close();
    const again = CompanyStore.open(dir, login);
    expect(accountBalance(again.ledger.state, '1101').balance).toBe(150);
    again.close();
  });

  it('detects edited, reordered or deleted records', () => {
    const { store } = create();
    sale(store, 100);
    sale(store, 200);
    store.close();
    fs.rmSync(path.join(dir, 'snapshot.enc'));
    const file = path.join(dir, 'journal.mzl');
    const original = fs.readFileSync(file, 'utf8');
    const lines = original.trim().split('\n');

    // تعديل النص المشفّر
    const rec = JSON.parse(lines[lines.length - 1]!);
    rec.ct = Buffer.from('x' + Buffer.from(rec.ct, 'base64').toString('latin1').slice(1), 'latin1').toString('base64');
    fs.writeFileSync(file, [...lines.slice(0, -1), JSON.stringify(rec)].join('\n') + '\n');
    expect(() => CompanyStore.open(dir, login)).toThrow(/العبث/);

    // حذف آخر عملية
    fs.writeFileSync(file, lines.slice(0, -1).join('\n') + '\n');
    expect(() => CompanyStore.open(dir, login)).toThrow(/ناقص/);

    fs.writeFileSync(file, original);
    CompanyStore.open(dir, login).close();
  });

  it('prevents opening a company that another running program holds', () => {
    create().store.close();
    fs.writeFileSync(path.join(dir, '.lock'), String(process.ppid));
    expect(() => CompanyStore.open(dir, login)).toThrow(/مفتوحة/);
    fs.writeFileSync(path.join(dir, '.lock'), '999999999');
    CompanyStore.open(dir, login).close();
  });

  it('creates encrypted backups that can be opened as companies', () => {
    const { store } = create();
    sale(store, 700);
    const backupDir = store.backup();
    store.close();
    const restored = CompanyStore.open(backupDir, login);
    expect(accountBalance(restored.ledger.state, '1101').balance).toBe(700);
    restored.close();
  });

  it('notifies listeners of new events', async () => {
    const { store } = create();
    const seen: string[] = [];
    store.onEvent((e) => seen.push(e.type));
    sale(store, 1);
    await Promise.resolve();
    expect(seen).toEqual(['entry.posted']);
    store.close();
  });

  it('refuses old unencrypted files and overwriting an existing company', () => {
    create().store.close();
    expect(() => create()).toThrow(/مسبقاً/);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'company.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'company.json'), JSON.stringify({ ...meta, format: 1 }));
    expect(() => peekCompany(dir)).toThrow(/قديم/);
  });

  it('a failed disk write does not damage the journal (disk full)', () => {
    const { store } = create();
    sale(store, 100);
    const real = fs.writeSync;
    const spy = vi.spyOn(fs, 'writeSync').mockImplementationOnce(((fd: number, data: string) => {
      real(fd, data.slice(0, 20)); // كتابة ناقصة ثم خطأ
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    }) as never);
    expect(() => sale(store, 200)).toThrow(/مساحة/);
    spy.mockRestore();
    sale(store, 300); // بعد تحرير المساحة يكمل العمل
    store.close();
    const reopened = CompanyStore.open(dir, login);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(400);
    reopened.close();
  });

  it('opens even if head.json was torn by a power cut', () => {
    const { store } = create();
    sale(store, 100);
    store.close();
    fs.writeFileSync(path.join(dir, 'head.json'), '');
    const reopened = CompanyStore.open(dir, login);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(100);
    reopened.close();
  });

  it('treats a lock from another computer as held, and an old lock as stale', () => {
    create().store.close();
    const lock = path.join(dir, '.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: 1, host: 'OTHER-PC' }));
    expect(() => CompanyStore.open(dir, login)).toThrow(/جهاز آخر/);
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(lock, old, old);
    CompanyStore.open(dir, login).close();
  });
});
