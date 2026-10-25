// الفواتير المفتوحة: كل فاتورة لسا ما انحفظت بتضل محفوظة هون، فالمستخدم بيقدر يروح
// على شاشة تانية أو يفتح فاتورة تانية ويرجع لها متل ما تركها (متل تبويبات المتصفح).
import { useSyncExternalStore } from 'react';

export interface InvoiceDraft {
  id: string;
  kind: string;
  title: string; // اسم الزبون أو «زبون نقدي»
  count: number; // عدد المواد
  updated: number;
  data: unknown; // حالة شاشة الفاتورة (InvoiceEditor بيعرف شكلها)
}

let company = '';
let drafts: InvoiceDraft[] = [];
const listeners = new Set<() => void>();
const storageKey = () => `mizan.drafts.${company}`;

function load(name: string) {
  if (name === company) return;
  company = name;
  try {
    drafts = JSON.parse(localStorage.getItem(storageKey()) ?? '[]') as InvoiceDraft[];
  } catch {
    drafts = [];
  }
}

function commit(next: InvoiceDraft[]) {
  drafts = next;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(drafts));
  } catch {
    // ما في تخزين: بتضل بالذاكرة لحد ما يتسكّر البرنامج
  }
  for (const l of listeners) l();
}

export const invoiceDrafts = {
  use(name: string): InvoiceDraft[] {
    load(name);
    return useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => drafts,
    );
  },
  get(name: string, id: string): InvoiceDraft | undefined {
    load(name);
    return drafts.find((d) => d.id === id);
  },
  /** آخر فاتورة مفتوحة من هالنوع (لما يرجع من القائمة بيلاقيها متل ما تركها). */
  latest(name: string, kind: string): InvoiceDraft | undefined {
    load(name);
    return drafts.filter((d) => d.kind === kind).sort((a, b) => b.updated - a.updated)[0];
  },
  save(name: string, draft: InvoiceDraft) {
    load(name);
    const i = drafts.findIndex((d) => d.id === draft.id);
    commit(i < 0 ? [...drafts, draft] : drafts.map((d, j) => (j === i ? draft : d)));
  },
  remove(name: string, id: string) {
    load(name);
    if (drafts.some((d) => d.id === id)) commit(drafts.filter((d) => d.id !== id));
  },
};
