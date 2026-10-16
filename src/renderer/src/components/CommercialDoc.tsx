import qrcode from 'qrcode-generator';
import type { CSSProperties, ReactNode } from 'react';
import type { PrintSettings } from '../../../core';
import { useCompany } from '../api';

// قالب موحّد لكل المستندات التجارية (فاتورة، مرتجع، عرض سعر...) بثلاثة تصاميم:
// عصري (ألوان الشركة)، كلاسيكي (جداول بإطارات)، وبسيط (أبيض وأسود). الطابعات الحرارية تأخذ نسخة مضغوطة تلقائياً.

export type DocTemplate = 'modern' | 'classic' | 'minimal';
export type DocStamp = 'paid' | 'credit' | 'void' | 'quote' | null;

export interface DocLine {
  description: ReactNode;
  sub?: ReactNode[];
  qty: string;
  price: string;
  total: string;
  discount?: string;
}

export interface DocModel {
  title: string;
  number: number | string;
  meta: { label: string; value: ReactNode }[]; // التاريخ، صالح حتى، المندوب...
  party?: { label: string; name: string; phone?: string; address?: string };
  refs?: ReactNode[]; // سيارة، طلب، طاولة...
  lines: DocLine[];
  totals: { label: string; value: string; muted?: boolean }[];
  grand: { label: string; value: string };
  after?: { label: string; value: string }[]; // المقبوض، الباقي، سعر الصرف
  words?: string;
  notes?: string;
  stamp: DocStamp;
  qrText?: string;
  signatures?: [string, string];
}

const STAMP_TEXT: Record<Exclude<DocStamp, null>, string> = { paid: 'مدفوعة', credit: 'آجل', void: 'ملغاة', quote: 'عرض سعر' };

function Qr({ text, size = 104 }: { text: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!;
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return (
    <svg className="doc-qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

export function CommercialDoc({ model, className, preview }: { model: DocModel; className?: string; preview?: PrintSettings }) {
  const { state } = useCompany();
  const c = state.info!;
  const p = preview ?? c.print ?? {};
  const template: DocTemplate = p.template ?? 'modern';
  const color = p.color ?? '#0f6e5c';
  const style = { ['--doc-color' as string]: color } as CSSProperties;
  const showQr = p.showQr !== false && !!model.qrText;
  const showStamp = p.showStamp !== false && model.stamp;
  const signatures = model.signatures ?? (p.showSignatures ? (['توقيع المستلم', 'توقيع المحاسب'] as [string, string]) : undefined);

  return (
    <div className={`print-area invoice-doc doc-${template} ${className ?? ''}`} style={style}>
      <header className="doc-head">
        <div className="doc-brand">
          {p.logo && <img src={p.logo} alt="" className="doc-logo" />}
          <div>
            <h1>{c.name}</h1>
            {p.header && <div className="doc-tagline">{p.header}</div>}
            <div className="doc-contact">
              {c.address && <span>{c.address}</span>}
              {c.phone && <span className="ltr">{c.phone}</span>}
              {c.taxNumber && <span>السجل: {c.taxNumber}</span>}
            </div>
          </div>
        </div>
        <div className="doc-titlebox">
          <h2>{model.title}</h2>
          <div className="doc-number">
            رقم <b className="ltr">{model.number}</b>
          </div>
        </div>
      </header>

      <section className="doc-info">
        {model.party && (
          <div className="doc-card party">
            <span className="doc-label">{model.party.label}</span>
            <strong>{model.party.name}</strong>
            {model.party.phone && <span className="ltr">{model.party.phone}</span>}
            {model.party.address && <span>{model.party.address}</span>}
          </div>
        )}
        {model.meta.map((m, i) => (
          <div className="doc-card" key={i}>
            <span className="doc-label">{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </section>
      {model.refs && model.refs.length > 0 && (
        <div className="doc-refs">
          {model.refs.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      )}

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>البيان</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((l, i) => (
            <tr key={i}>
              <td className="n">{i + 1}</td>
              <td>
                {l.description}
                {l.sub?.map((s, j) => (
                  <div className="doc-sub" key={j}>
                    {s}
                  </div>
                ))}
              </td>
              <td className="nowrap">{l.qty}</td>
              <td className="nowrap">{l.price}</td>
              <td className="nowrap">
                {l.total}
                {l.discount && <div className="doc-sub">خصم {l.discount}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="doc-bottom">
        <div className="doc-side">
          {showQr && <Qr text={model.qrText!} />}
          <div>
            {model.words && <p className="doc-words">{model.words}</p>}
            {model.notes && <p className="doc-notes">{model.notes}</p>}
          </div>
        </div>
        <div className="doc-totals">
          {model.totals.map((t, i) => (
            <div key={i} className={t.muted ? 'muted' : ''}>
              <span>{t.label}</span>
              <strong>{t.value}</strong>
            </div>
          ))}
          <div className="grand">
            <span>{model.grand.label}</span>
            <strong>{model.grand.value}</strong>
          </div>
          {model.after?.map((t, i) => (
            <div key={i} className="after">
              <span>{t.label}</span>
              <strong>{t.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {showStamp && <div className={`doc-stamp ${model.stamp}`}>{STAMP_TEXT[model.stamp!]}</div>}
      {p.terms && <div className="doc-terms">{p.terms}</div>}
      {signatures && (
        <div className="doc-signatures">
          <span>{signatures[0]}</span>
          <span>{signatures[1]}</span>
        </div>
      )}
      <footer className="doc-foot">{p.footer || 'شكراً لتعاملكم معنا'}</footer>
    </div>
  );
}

/** فاتورة تجريبية لمعاينة التصميم في الإعدادات. */
export function sampleModel(currencySymbol: string): DocModel {
  const f = (n: number) => `${n.toLocaleString('en', { minimumFractionDigits: 2 })} ${currencySymbol}`;
  return {
    title: 'فاتورة مبيع',
    number: 128,
    meta: [{ label: 'التاريخ', value: <span className="ltr">11/10/2026</span> }],
    party: { label: 'السيد/ة', name: 'أبو خالد', phone: '0933 111 222' },
    lines: [
      { description: 'زيت محرك 5W30 - 4 لتر', qty: '2 علبة', price: f(3500), total: f(7000) },
      { description: 'فلتر زيت', sub: ['كفالة 6 شهراً'], qty: '1 قطعة', price: f(750), total: f(750) },
      { description: 'أجور تغيير زيت', qty: '1', price: f(500), total: f(500) },
    ],
    totals: [{ label: 'المجموع', value: f(8250) }],
    grand: { label: 'الإجمالي', value: f(8250) },
    after: [{ label: 'المقبوض', value: f(8250) }],
    words: 'فقط ثمانية آلاف ومئتان وخمسون ليرة سورية لا غير',
    stamp: 'paid',
    qrText: 'معيار — فاتورة تجريبية',
  };
}
