// فواتير المسودة: قائمة، فتح للتعديل والاعتماد، طباعة بختم «مسودة»، وحذف.
import { useMemo, useState } from 'react';
import { amountInWords, displayDecimals, INVOICE_KIND_NAMES, type SavedDraft } from '../../../core';
import { dateText, money, qtyText, useCompany } from '../api';
import { CommercialDoc, type DocModel } from './CommercialDoc';
import { PrintButtons } from './print';
import { ConfirmButton, Empty, matches, Modal } from './ui';
import { Icon } from './icons';

const draftPerm = (kind: string) => (kind === 'purchase' || kind === 'purchase_return' ? 'purchases.create' : kind === 'sale_return' ? 'returns.create' : 'sales.create');

export function DraftsList({ query }: { query: string }) {
  const { state, navigate, can, call, notify, user } = useCompany();
  const [printing, setPrinting] = useState<SavedDraft | null>(null);
  const mineOnly = !can('invoices.all');
  const rows = useMemo(
    () =>
      Object.values(state.drafts ?? {})
        .filter((d) => can(draftPerm(d.kind) as never) && (!mineOnly || d.createdBy === user.id) && matches(query, d.number, d.title, d.notes, ...d.lines.map((l) => l.description)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.drafts, query, mineOnly, user.id, can],
  );
  if (!rows.length)
    return (
      <Empty>
        ما في مسودات. بأي فاتورة اكبس «حفظ كمسودة»: بتنحفظ وبتبيّن عكل الأجهزة، وما بتأثّر عالمخزون ولا الحسابات لحد ما تعتمدها.
      </Empty>
    );
  return (
    <>
      <p className="muted">المسودة ما بتحرّك بضاعة ولا حسابات. افتحها لتكمّلها، وكبسة «اعتماد المسودة كفاتورة» بتحوّلها لفاتورة حقيقية.</p>
      <table className="table drafts-table">
        <thead>
          <tr>
            <th>المسودة</th>
            <th>النوع</th>
            <th>التاريخ</th>
            <th>الزبون / المورد</th>
            <th>المواد</th>
            <th>الإجمالي</th>
            <th>آخر تعديل</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="clickable" onClick={() => navigate(d.kind, `sd:${d.id}`)}>
              <td data-label="المسودة">
                <span className="tag">مسودة {d.number}</span>
              </td>
              <td data-label="النوع">{INVOICE_KIND_NAMES[d.kind]}</td>
              <td data-label="التاريخ" className="ltr">{dateText(d.date)}</td>
              <td data-label="الزبون / المورد">{d.title}</td>
              <td data-label="المواد">{d.lines.length}</td>
              <td data-label="الإجمالي" className="num">{money(state, d.total, d.currency)}</td>
              <td data-label="آخر تعديل" className="muted">
                {state.users[d.updatedBy ?? d.createdBy]?.displayName ?? ''} · {new Date(d.updatedAt).toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ghost small" onClick={() => navigate(d.kind, `sd:${d.id}`)}>
                  <Icon name="file" size={14} /> فتح واعتماد
                </button>
                <button type="button" className="ghost small" onClick={() => setPrinting(d)}>
                  <Icon name="printer" size={14} /> طباعة
                </button>
                <ConfirmButton
                  className="ghost small danger"
                  label="حذف"
                  confirmLabel="متأكد؟"
                  onConfirm={async () => {
                    if (await call('deleteDraft', d.id, d.kind)) notify(`انحذفت المسودة ${d.number}`);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {printing && (
        <Modal title={`مسودة رقم ${printing.number}`} onClose={() => setPrinting(null)} width={820}>
          <div className="modal-actions no-print">
            <PrintButtons kind="invoice" name={`مسودة ${printing.number}`} papers={['a4', 'a5', '80mm']} />
          </div>
          <DraftDocument draft={printing} />
        </Modal>
      )}
    </>
  );
}

/** المسودة المطبوعة: نفس شكل الفاتورة بختم «مسودة» (مش فاتورة نهائية). */
export function DraftDocument({ draft: d }: { draft: SavedDraft }) {
  const { state } = useCompany();
  const party = d.partyId ? state.parties[d.partyId] : null;
  const m = (v: number) => money(state, v, d.currency);
  const decimals = state.currencies[d.currency]?.decimals ?? 2;
  const model: DocModel = {
    title: `مسودة ${INVOICE_KIND_NAMES[d.kind]}`,
    number: d.number,
    meta: [{ label: 'التاريخ', value: <span className="ltr">{dateText(d.date)}</span> }],
    party: { label: d.kind === 'purchase' || d.kind === 'purchase_return' ? 'المورد' : 'السيد/ة', name: party?.name ?? d.title, ...(party?.phone ? { phone: party.phone } : {}), ...(party?.address ? { address: party.address } : {}) },
    lines: d.lines.map((l) => ({
      description: l.description,
      qty: `${qtyText(l.qty)} ${l.unit ?? ''}`,
      price: m(l.price),
      total: m(Math.round(l.qty * l.price) - (l.discount ?? 0)),
      ...(l.discount ? { discount: m(l.discount) } : {}),
    })),
    totals: [{ label: 'المجموع', value: m(d.subtotal) }, ...(d.discount ? [{ label: 'الخصم', value: m(d.discount) }] : []), ...d.taxes.map((t) => ({ label: t.name, value: m(t.amount) }))],
    grand: { label: 'الإجمالي', value: m(d.total) },
    words: amountInWords(d.total, d.currency, displayDecimals(state, d.currency)),
    notes: [d.notes, 'هذه مسودة وليست فاتورة نهائية'].filter(Boolean).join(' — '),
    stamp: 'draft',
    qrText: [state.info!.name, `مسودة رقم ${d.number}`, dateText(d.date), `الإجمالي: ${m(d.total)}`].join('\n'),
  };
  return <CommercialDoc model={model} />;
}
