import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { DEFAULT_CURRENCIES, chartFor } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// ملف منتجات كامل (عشرات آلاف المواد): كان الاستيراد ياخد دقايق (فحص كل مادة مع الكل + مزامنة القرص لكل مادة)
it('saves thousands of items quickly, still refusing duplicate codes and barcodes, and survives reopening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-bulk-'));
  const opts = { info: { name: 'سوبرماركت', baseCurrency: 'SYP', fiscalYearStart: '01-01' }, currencies: DEFAULT_CURRENCIES, accounts: chartFor('general'), owner: { username: 'admin', displayName: 'المالك', password: 'secret123' } };
  const store = CompanyStore.create(dir, opts).store;
  const item = (i: number) => ({ id: `i${i}`, code: String(1000 + i), barcode: `62100000${String(i).padStart(5, '0')}`, name: `مادة ${i}`, kind: 'stock', unit: 'قطعة', price: 0, priceCurrency: 'SYP' });
  const t = Date.now();
  execute(store, store.user, 'saveItems', [Array.from({ length: 8000 }, (_, i) => item(i))]);
  expect(Date.now() - t).toBeLessThan(8000);
  expect(Object.keys(store.ledger.state.items)).toHaveLength(8000);
  // تكرار جوّا الدفعة أو مع الموجود: ما بينحفظ شي
  expect(() => execute(store, store.user, 'saveItems', [[{ ...item(9000), barcode: item(5).barcode }]])).toThrow(/الباركود/);
  expect(() => execute(store, store.user, 'saveItems', [[item(9001), { ...item(9002), code: item(9001).code }]])).toThrow(/الرمز/);
  expect(Object.keys(store.ledger.state.items)).toHaveLength(8000);
  // تعديل مادة بنفس رمزها وباركودها بالدفعة: مسموح
  execute(store, store.user, 'saveItems', [[{ ...item(3), name: 'مادة معدّلة' }]]);
  store.close();
  const again = CompanyStore.open(dir, { username: 'admin', password: 'secret123' });
  expect(again.ledger.state.items['i3']!.name).toBe('مادة معدّلة');
  expect(Object.keys(again.ledger.state.items)).toHaveLength(8000);
  again.close();
}, 60000);
