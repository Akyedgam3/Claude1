import qrcode from 'qrcode-generator';
import type { ReactNode } from 'react';
import type { ReceiptSettings } from '../../../core';
import { useCompany } from '../api';

// الإيصال الحراري (80/58mm): تصميم مستقل عن الفاتورة الكاملة، وصاحب المحل بيتحكم بكل سطر فيه من الإعدادات.

export interface ReceiptLine {
  name: ReactNode;
  sub?: ReactNode[];
  qty: string;
  price: string;
  total: string;
}

export interface ReceiptData {
  title: string;
  number?: string | number;
  date?: string;
  time?: string;
  table?: string;
  orderType?: string; // سفري / توصيل
  orderNo?: number | string;
  captain?: string;
  guests?: number;
  cashier?: string;
  customer?: string;
  lines: ReceiptLine[];
  totals: { label: string; value: string }[];
  grand: { label: string; value: string };
  after?: { label: string; value: string }[];
  note?: string;
  qrText?: string;
  draft?: boolean; // الحساب المبدئي قبل الدفع
}

const on = (v: boolean | undefined) => v !== false;

function Qr({ text }: { text: string }) {
  const qr = qrcode(0, 'M');
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!;
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return (
    <svg className="t-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** always = يطلع بالطباعة مهما كان الورق (الحساب المبدئي)، وإلا بيطلع بس على ورق حراري بدل الفاتورة الكاملة. */
export function ThermalReceipt({ data, preview, always, logo }: { data: ReceiptData; preview?: ReceiptSettings; always?: boolean; logo?: string }) {
  const { state } = useCompany();
  const c = state.info!;
  const r = preview ?? c.print?.receipt ?? {};
  const img = logo ?? c.print?.logo;
  const logoMode = r.logo ?? 'small';
  const showPrice = on(r.showPrice);
  const meta: [string, ReactNode][] = [];
  if (on(r.showNumber) && data.number !== undefined) meta.push([data.draft ? 'رقم الطلب' : 'رقم الفاتورة', <b className="ltr">{data.number}</b>]);
  if (on(r.showDate) && data.date) meta.push(['التاريخ', <span className="ltr">{data.date}</span>]);
  if (on(r.showTable) && data.table) meta.push(['الطاولة', <b>{data.table}</b>]);
  if (on(r.showOrderType) && data.orderType) meta.push(['الطلب', <b>{data.orderType}</b>]);
  if (!data.draft && on(r.showNumber) && data.orderNo !== undefined) meta.push(['رقم الطلب', <span className="ltr">{data.orderNo}</span>]);
  if (on(r.showCaptain) && data.captain) meta.push(['الكابتن', data.captain]);
  if (on(r.showGuests) && data.guests) meta.push(['الضيوف', <span className="ltr">{data.guests}</span>]);
  if (on(r.showCashier) && data.cashier) meta.push(['الكاشير', data.cashier]);
  if (on(r.showCustomer) && data.customer) meta.push(['الزبون', data.customer]);

  return (
    <div className={`thermal-doc print-area t-${r.fontSize ?? 'md'} ${r.grid ? 't-grid' : ''} ${always ? 'always' : ''}`}>
      {img && logoMode !== 'none' && (
        <div className={`t-logo ${logoMode}`}>
          <img src={img} alt="" />
        </div>
      )}
      {on(r.showName) && <div className="t-name">{c.name}</div>}
      {r.header && <div className="t-header">{r.header}</div>}
      {on(r.showContact) && (c.address || c.phone) && (
        <div className="t-contact">
          {c.address && <span>{c.address}</span>}
          {c.phone && <span className="ltr">{c.phone}</span>}
        </div>
      )}
      <div className="t-title">{data.draft ? 'الحساب' : (r.title || data.title)}</div>
      {meta.length > 0 && (
        <div className="t-meta">
          {meta.map(([k, v], i) => (
            <div key={i}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      )}
      <table className="t-lines">
        <thead>
          <tr>
            <th className="t-n">الصنف</th>
            <th>الكمية</th>
            {showPrice && <th>السعر</th>}
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td className="t-n">
                {l.name}
                {l.sub?.map((s, j) => (
                  <div className="t-sub" key={j}>
                    {s}
                  </div>
                ))}
              </td>
              <td className="num">{l.qty}</td>
              {showPrice && <td className="num">{l.price}</td>}
              <td className="num">{l.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="t-totals">
        {data.totals.map((t, i) => (
          <div key={i}>
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
        <div className="t-grand">
          <span>{data.grand.label}</span>
          <strong>{data.grand.value}</strong>
        </div>
        {data.after?.map((t, i) => (
          <div key={i}>
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </div>
      {on(r.showTime) && data.time && <div className="t-time ltr">{data.time}</div>}
      {data.note && <div className="t-note">{data.note}</div>}
      {data.draft && <div className="t-draft">هذه ليست فاتورة نهائية</div>}
      {r.contactPhone && (
        <div className="t-phone">
          {r.contactLabel || 'للاستفسار'} <b className="ltr">{r.contactPhone}</b>
        </div>
      )}
      {r.showQr && data.qrText && <Qr text={data.qrText} />}
      <div className="t-thanks">{r.thanks ?? 'شكراً لزيارتكم'}</div>
      {r.footer && <div className="t-footer">{r.footer}</div>}
    </div>
  );
}

/** إيصال مطعم تجريبي لمعاينة التصميم بالإعدادات. */
export function sampleReceipt(symbol: string): ReceiptData {
  const f = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2 });
  const rows: [string, number, number][] = [
    ['وجبة اسكالوب', 1, 27500],
    ['سندويشة فاهيتا', 1, 16000],
    ['بيتزا شيش', 1, 25000],
    ['كولا تنك', 2, 3000],
    ['عيران', 1, 3000],
    ['ماء صغيرة', 3, 1000],
  ];
  const total = rows.reduce((t, [, q, p]) => t + q * p, 0);
  const now = new Date();
  return {
    title: 'فاتورة مبيع',
    number: 8,
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleString('en-GB'),
    table: 'طاولة 13',
    orderNo: 42,
    captain: 'أبو سمير',
    guests: 4,
    cashier: 'المالك',
    lines: rows.map(([name, q, p]) => ({ name, qty: String(q), price: f(p), total: f(q * p) })),
    totals: [
      { label: 'المجموع', value: `${f(total)} ${symbol}` },
      { label: 'الخصم', value: `0.00 ${symbol}` },
    ],
    grand: { label: 'الصافي', value: `${f(total)} ${symbol}` },
    qrText: `فاتورة 8\n${f(total)}`,
  };
}
