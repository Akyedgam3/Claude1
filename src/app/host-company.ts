import type { CompanyStore } from '../storage/company-store';
import { execute } from './executor';
import type { EventItem, HostCompany } from './lan';

/** يربط الشركة المفتوحة (المشفّرة) بخادم الشبكة المحلية. */
export function hostCompanyFor(store: CompanyStore, license: { blocked: () => string | null; devices: () => number }): HostCompany {
  return {
    name: store.ledger.state.info?.name ?? store.meta.name,
    id: store.meta.id,
    snapshot: () => ({ state: store.ledger.state, seq: store.lastSeq }),
    verify: (u, p) => store.verify(u, p),
    execute: (user, method, args) => execute(store, user, method, args),
    subscribe: (fn: (item: EventItem) => void) => store.onEvent((event, seq) => fn({ event, seq })),
    blocked: license.blocked,
    maxClients: () => Math.max(0, license.devices() - 1),
    userActive: (id) => !!store.ledger.state.users[id]?.active,
  };
}
