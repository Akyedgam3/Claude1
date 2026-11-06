import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, chartFor } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';
import { autoBackup, periodicBackup, readBackupConfig, writeBackupConfig } from '../src/main/backup-location';

let dir: string;
let ext: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-co-'));
  ext = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-ext-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(ext, { recursive: true, force: true });
});

const make = () =>
  CompanyStore.create(dir, {
    info: { name: 'محل', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
    currencies: DEFAULT_CURRENCIES,
    accounts: chartFor('general'),
    owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
  }).store;

describe('backup location', () => {
  it('defaults to the company folder', () => {
    const store = make();
    expect(readBackupConfig(store)).toEqual({ keep: 30, internal: true, every: 60 });
    const r = autoBackup(store);
    expect(r.path.startsWith(path.join(dir, 'backups'))).toBe(true);
    store.close();
  });

  it('writes to the chosen folder, keeps N copies there, and can skip the internal copy', () => {
    const store = make();
    writeBackupConfig(store, { dir: ext, keep: 2, internal: false });
    for (let i = 0; i < 3; i++) autoBackup(store);
    const root = path.join(ext, 'Wazn-محل');
    expect(fs.readdirSync(root).length).toBe(2);
    expect(fs.existsSync(path.join(root, fs.readdirSync(root)[0]!, 'journal.mzl'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false);
    store.close();
  });

  it('falls back to the company folder when the chosen folder is gone (USB unplugged)', () => {
    const store = make();
    writeBackupConfig(store, { dir: path.join(ext, 'missing'), keep: 30, internal: false });
    const r = autoBackup(store);
    expect(r.failed).toBeTruthy();
    expect(r.path.startsWith(path.join(dir, 'backups'))).toBe(true);
    // بدون مجلد مختار النسخة الداخلية ما بتنطفى
    expect(writeBackupConfig(store, { keep: 30, internal: false }).internal).toBe(true);
    store.close();
  });

  it('periodic backup: only after the chosen period and only when something changed', () => {
    const store = make();
    writeBackupConfig(store, { dir: ext, keep: 30, internal: false, every: 60 });
    const t0 = 1_000_000;
    expect(periodicBackup(store, t0)).toBe(false); // أول مرة: بيبلّش العدّاد
    store.ledger.saveParty({ id: 'p', kind: 'customer', name: 'زبون' });
    expect(periodicBackup(store, t0 + 30 * 60_000)).toBe(false); // لسا ما مرّت ساعة
    expect(periodicBackup(store, t0 + 61 * 60_000)).toBe(true);
    expect(fs.readdirSync(path.join(ext, 'Wazn-محل')).length).toBe(1);
    expect(periodicBackup(store, t0 + 200 * 60_000)).toBe(false); // ما في شي جديد
    writeBackupConfig(store, { dir: ext, keep: 30, internal: false, every: 0 });
    store.ledger.saveParty({ id: 'q', kind: 'customer', name: 'زبون ٢' });
    expect(periodicBackup(store, t0 + 999 * 60_000)).toBe(false); // مطفي: بس عند الإغلاق
    store.close();
  });
});
