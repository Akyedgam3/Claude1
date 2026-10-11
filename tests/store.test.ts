import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCIES, accountBalance, tradingChart } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function create(): CompanyStore {
  return CompanyStore.create(dir, { name: 'محل', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, DEFAULT_CURRENCIES, tradingChart());
}

const sale = (store: CompanyStore, amount: number) =>
  store.ledger.postEntry({ date: '2026-01-05', memo: 'بيع', lines: [{ accountId: '1101', debit: amount }, { accountId: '4101', credit: amount }] });

describe('CompanyStore', () => {
  it('persists to disk and reloads the same state', () => {
    const store = create();
    sale(store, 1500);
    store.close();
    const reopened = CompanyStore.open(dir);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(1500);
    expect(reopened.ledger.state.info?.name).toBe('محل');
    reopened.close();
  });

  it('reloads correctly from snapshot plus newer journal records', () => {
    const store = create();
    sale(store, 100);
    store.snapshot();
    sale(store, 200);
    // إغلاق مفاجئ بدون close(): نحذف القفل فقط كما لو أن العملية ماتت
    fs.rmSync(path.join(dir, '.lock'));
    const reopened = CompanyStore.open(dir);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(300);
    reopened.close();
  });

  it('recovers from a half-written last line (power cut)', () => {
    const store = create();
    sale(store, 100);
    store.close();
    fs.appendFileSync(path.join(dir, 'journal.mzl'), '{"seq":999,"at":"2026');
    fs.rmSync(path.join(dir, 'snapshot.json'));
    const reopened = CompanyStore.open(dir);
    expect(reopened.recoveredTail).toBe(true);
    expect(accountBalance(reopened.ledger.state, '1101').balance).toBe(100);
    sale(reopened, 50); // يمكن متابعة العمل بعد الإصلاح
    reopened.close();
    const again = CompanyStore.open(dir);
    expect(accountBalance(again.ledger.state, '1101').balance).toBe(150);
    again.close();
  });

  it('detects tampering with recorded operations', () => {
    const store = create();
    sale(store, 100);
    store.close();
    const file = path.join(dir, 'journal.mzl');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"debit":100', '"debit":900').replace('"baseDebit":100', '"baseDebit":900'));
    expect(() => CompanyStore.open(dir)).toThrow(/العبث/);
  });

  it('prevents opening a company that another running program holds', () => {
    create().close();
    fs.writeFileSync(path.join(dir, '.lock'), String(process.ppid)); // عملية أخرى حيّة
    expect(() => CompanyStore.open(dir)).toThrow(/مفتوحة/);
    fs.writeFileSync(path.join(dir, '.lock'), '999999999'); // قفل قديم لعملية منتهية
    CompanyStore.open(dir).close();
  });

  it('creates backups that can be opened as companies', () => {
    const store = create();
    sale(store, 700);
    const backupDir = store.backup();
    store.close();
    const restored = CompanyStore.open(backupDir);
    expect(accountBalance(restored.ledger.state, '1101').balance).toBe(700);
    restored.close();
  });

  it('refuses to overwrite an existing company', () => {
    create().close();
    expect(() => create()).toThrow(/مسبقاً/);
  });
});
