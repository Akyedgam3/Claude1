import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/app/executor';
import { DEALER_BOX_ID, DEFAULT_CURRENCIES, accountBalance, chartFor, trialBalance } from '../src/core';
import { CompanyStore } from '../src/storage/company-store';

// «صندوق المورد» (للصيدليات) انعمل بالغلط بمحل جوالات: كبسة بترجّع كل شي للصندوق العادي

describe('wrong dealer box', () => {
  it('moves its balance and users back to the normal box and archives it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wazn-db-'));
    try {
      const { store } = CompanyStore.create(dir, {
        info: { name: 'جوالات', activity: 'mobile', baseCurrency: 'SYP', fiscalYearStart: '01-01' },
        currencies: DEFAULT_CURRENCIES,
        accounts: chartFor('mobile'),
        owner: { username: 'admin', displayName: 'المالك', password: 'secret123' },
      });
      execute(store, store.user, 'setupDealerBox', []);
      execute(store, store.user, 'updateUser', [{ ...store.user, cashAccountId: DEALER_BOX_ID }, '']);
      execute(store, store.user, 'saveItem', [{ id: 'i', code: '1', name: 'شاحن', kind: 'service', unit: 'قطعة', price: 5000, priceCurrency: 'SYP' }]);
      execute(store, store.user, 'postInvoice', [{ kind: 'sale', date: '2026-11-20', paid: 5000, lines: [{ itemId: 'i', qty: 1, price: 5000 }] }]);
      const st = store.ledger.state;
      // رصيد بصندوق المورد
      store.ledger.transferBox({ date: '2026-11-20', from: '1101', to: DEALER_BOX_ID, amount: 2000 });
      expect(accountBalance(st, DEALER_BOX_ID).balance).toBe(2000);
      const target = (execute(store, store.user, 'removeDealerBox', []) as { value: string }).value;
      expect(accountBalance(st, DEALER_BOX_ID).balance).toBe(0);
      expect(accountBalance(st, target).balance).toBe(5000);
      expect(st.accounts[DEALER_BOX_ID]!.archived).toBe(true);
      expect(Object.values(st.users).every((u) => u.cashAccountId !== DEALER_BOX_ID)).toBe(true);
      const tb = trialBalance(st);
      expect(tb.totalDebit).toBe(tb.totalCredit);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
