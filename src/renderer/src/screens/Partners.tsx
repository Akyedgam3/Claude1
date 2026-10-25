import { useMemo, useState } from 'react';
import { PARTNER_MOVE_NAMES, partnerMoves, partnersSummary, type Partner, type PartnerMoveKind, type PartnerRow } from '../../../core';
import { dateText, major, money, parseAmount, today, toInput, uid, useCompany } from '../api';
import { DocHeader, ExportButtons, PrintButtons } from '../components/print';
import { Empty, Field, Modal, PageHeader } from '../components/ui';
import { Icon } from '../components/icons';
import { cashAccounts } from './InvoiceEditor';

// الشركاء والمساهمين: رأس مال كل واحد ونسبته، ونصيبه من الأرباح، وكل إيداع أو سحب بتاريخه.

const pct = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en')}٪`;

function yearStart(fys: string | undefined): string {
  const d = today();
  const start = `${d.slice(0, 4)}-${fys ?? '01-01'}`;
  return start <= d ? start : `${Number(d.slice(0, 4)) - 1}-${fys ?? '01-01'}`;
}

export function Partners() {
  const { state, call, notify, can } = useCompany();
  const [from, setFrom] = useState(() => yearStart(state.info?.fiscalYearStart));
  const [to, setTo] = useState(today());
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [moving, setMoving] = useState<{ partner: Partner; kind: PartnerMoveKind } | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);
  const summary = useMemo(() => partnersSummary(state, { from, to }), [state, from, to]);
  const canWrite = can('partners.manage');
  const all = Object.values(state.partners ?? {});
  const totalDue = summary.rows.reduce((s, r) => s + r.due, 0);

  return (
    <div className="page partners">
      <PageHeader title="الشركاء والمساهمين">
        {canWrite && (
          <button className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> شريك جديد
          </button>
        )}
        {canWrite && summary.rows.length > 0 && summary.netProfit > 0 && <button onClick={() => setDistributing(true)}>توزيع أرباح الفترة</button>}
        <ExportButtons
          name="الشركاء"
          sheets={() => [
            {
              name: 'الشركاء',
              columns: [
                { header: 'الشريك', key: 'name' },
                { header: 'رأس المال', key: 'capital', type: 'money' },
                { header: 'نسبة رأس المال ٪', key: 'cp', type: 'number' },
                { header: 'نسبة الأرباح ٪', key: 'pp', type: 'number' },
                { header: 'نصيبه من ربح الفترة', key: 'share', type: 'money' },
                { header: 'سحب من الأرباح بالفترة', key: 'out', type: 'money' },
                { header: 'الباقي إلو', key: 'due', type: 'money' },
              ],
              rows: summary.rows.map((r) => ({
                name: r.partner.name,
                capital: major(state, r.capital),
                cp: Math.round(r.capitalPct * 100) / 100,
                pp: Math.round(r.profitPct * 100) / 100,
                share: major(state, r.profitShare),
                out: major(state, r.withdrawnProfit),
                due: major(state, r.due),
              })),
            },
          ]}
        />
      </PageHeader>

      <p className="muted page-intro">
        سجّل كل شريك ورأس ماله. البرنامج بيحسب نسبة كل واحد من رأس المال، ونصيبه من ربح الفترة (حسب النسبة المتفق عليها أو حسب رأس ماله)، وبيبيّن كل إيداع أو سحب بتاريخه. كل حركة بتنزل عالصندوق والحسابات لحالها.
      </p>

      <div className="toolbar">
        <Field label="من">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="إلى">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="stats">
        <div className="stat">
          <span>
            <Icon name="wallet" size={16} /> رأس المال الكلي
          </span>
          <strong>{money(state, summary.totalCapital)}</strong>
          <small className="muted">{summary.rows.length} شريك</small>
        </div>
        <div className="stat">
          <span>
            <Icon name="trend" size={16} /> صافي ربح الفترة
          </span>
          <strong className={summary.netProfit >= 0 ? 'good' : 'bad'}>{money(state, summary.netProfit)}</strong>
          <small className="muted">
            {dateText(from)} ← {dateText(to)}
          </small>
        </div>
        <div className="stat">
          <span>
            <Icon name="users" size={16} /> الباقي للشركاء من ربح الفترة
          </span>
          <strong>{money(state, totalDue)}</strong>
          <small className="muted">نصيبهم ناقص اللي سحبوه</small>
        </div>
      </div>

      {all.length === 0 ? (
        <Empty>ما في شركاء لسا. ضيف أول شريك ورأس ماله.</Empty>
      ) : (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>الشريك</th>
                <th className="num">رأس المال</th>
                <th className="num">نسبته من رأس المال</th>
                <th className="num">نسبته من الأرباح</th>
                <th className="num">نصيبه من ربح الفترة</th>
                <th className="num">سحب من الأرباح</th>
                <th className="num">الباقي إلو</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.partner.id} className="clickable" onClick={() => setShowing(r.partner.id)}>
                  <td>
                    <strong>{r.partner.name}</strong>
                    {r.partner.phone && <div className="muted ltr">{r.partner.phone}</div>}
                  </td>
                  <td className="num">{money(state, r.capital)}</td>
                  <td className="num">{pct(r.capitalPct)}</td>
                  <td className="num">
                    {pct(r.profitPct)}
                    {r.partner.profitPercent !== undefined && <small className="muted"> (متفق عليها)</small>}
                  </td>
                  <td className={`num ${r.profitShare >= 0 ? 'good' : 'bad'}`}>{money(state, r.profitShare)}</td>
                  <td className="num">{money(state, r.withdrawnProfit)}</td>
                  <td className={`num ${r.due >= 0 ? '' : 'bad'}`}>
                    <strong>{money(state, r.due)}</strong>
                  </td>
                  {canWrite && (
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setMoving({ partner: r.partner, kind: 'capital_in' })}>إيداع</button>
                      <button onClick={() => setMoving({ partner: r.partner, kind: 'profit_out' })}>سحب أرباح</button>
                      <button className="ghost" onClick={() => setMoving({ partner: r.partner, kind: 'capital_out' })}>
                        سحب رأس مال
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {all.some((p) => !p.active) && <p className="muted">شركاء موقوفين: {all.filter((p) => !p.active).map((p) => p.name).join('، ')}</p>}
        </section>
      )}

      {editing && <PartnerForm partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MoveForm partner={moving.partner} kind={moving.kind} onClose={() => setMoving(null)} />}
      {distributing && <DistributeForm rows={summary.rows} to={to} onClose={() => setDistributing(false)} />}
      {showing && state.partners?.[showing] && (
        <PartnerDetails
          row={summary.rows.find((r) => r.partner.id === showing)}
          partner={state.partners[showing]!}
          onClose={() => setShowing(null)}
          onEdit={() => {
            setEditing(state.partners[showing]!);
            setShowing(null);
          }}
          onVoid={async (entryId) => {
            if (!confirm('تلغي هالحركة؟ بينعمل قيد عكسي بتاريخ اليوم.')) return;
            if (await call('voidPartnerMove', entryId, today())) notify('تم إلغاء الحركة');
          }}
        />
      )}
    </div>
  );
}

function PartnerForm({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const boxes = cashAccounts(state, base);
  const [f, setF] = useState({
    name: partner?.name ?? '',
    phone: partner?.phone ?? '',
    notes: partner?.notes ?? '',
    profitPercent: partner?.profitPercent !== undefined ? String(partner.profitPercent) : '',
    active: partner?.active ?? true,
    capital: '',
    cash: boxes[0]?.id ?? '1101',
    date: today(),
  });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={partner ? `تعديل ${partner.name}` : 'شريك جديد'} onClose={onClose} width={560}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const id = partner?.id ?? uid();
            const saved = await call('savePartner', {
              id,
              name: f.name,
              phone: f.phone,
              notes: f.notes,
              ...(f.profitPercent.trim() !== '' ? { profitPercent: Number(f.profitPercent) } : {}),
              active: f.active,
            });
            if (!saved) return;
            const amount = f.capital.trim() ? parseAmount(state, f.capital, base) : 0;
            if (amount > 0 && !(await call('partnerMove', { partnerId: id, kind: 'capital_in', amount, date: f.date, cashAccountId: f.cash, memo: 'رأس المال عند الدخول' }))) return;
            notify('تم الحفظ');
            onClose();
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="الاسم">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
        </Field>
        <Field label="الهاتف">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" />
        </Field>
        <Field label="نسبة الأرباح المتفق عليها ٪ (فاضية = حسب رأس ماله)">
          <input value={f.profitPercent} onChange={(e) => setF({ ...f, profitPercent: e.target.value })} inputMode="decimal" placeholder="مثلاً 25" />
        </Field>
        {!partner && (
          <>
            <Field label={`رأس المال اللي دفعه (${state.currencies[base]?.symbol})`}>
              <input value={f.capital} onChange={(e) => setF({ ...f, capital: e.target.value })} inputMode="decimal" placeholder="اختياري" />
            </Field>
            {f.capital.trim() && (
              <>
                <Field label="انحط بالصندوق">
                  <select value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })}>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="التاريخ">
                  <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
                </Field>
              </>
            )}
          </>
        )}
        <Field label="ملاحظات" wide>
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {partner && (
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> شريك فعّال
          </label>
        )}
        <div className="button-row wide">
          <button className="primary" disabled={busy}>
            حفظ
          </button>
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

const MOVE_HINTS: Record<PartnerMoveKind, string> = {
  capital_in: 'الشريك حط مصاري برأس المال: بتنزل عالصندوق وبيزيد رأس ماله.',
  capital_out: 'الشريك سحب من رأس ماله: بتطلع من الصندوق وبتنقص نسبته.',
  profit_out: 'الشريك سحب من أرباحه: بتطلع من الصندوق وبتنحسب من نصيبه بالأرباح.',
  profit_share: 'تثبيت نصيب الشريك من الأرباح بحسابه الجاري.',
};

function MoveForm({ partner, kind: kind0, onClose }: { partner: Partner; kind: PartnerMoveKind; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const boxes = cashAccounts(state, base);
  const [kind, setKind] = useState(kind0);
  const [f, setF] = useState({ amount: '', date: today(), memo: '', cash: boxes[0]?.id ?? '1101' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`${PARTNER_MOVE_NAMES[kind]} — ${partner.name}`} onClose={onClose} width={520}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const amount = parseAmount(state, f.amount, base);
            if (await call('partnerMove', { partnerId: partner.id, kind, amount, date: f.date, memo: f.memo, cashAccountId: f.cash })) {
              notify(`تم تسجيل ${PARTNER_MOVE_NAMES[kind]}`);
              onClose();
            }
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="الحركة" wide>
          <select value={kind} onChange={(e) => setKind(e.target.value as PartnerMoveKind)}>
            {(['capital_in', 'capital_out', 'profit_out'] as PartnerMoveKind[]).map((k) => (
              <option key={k} value={k}>
                {PARTNER_MOVE_NAMES[k]}
              </option>
            ))}
          </select>
          <small className="muted">{MOVE_HINTS[kind]}</small>
        </Field>
        <Field label={`المبلغ (${state.currencies[base]?.symbol})`}>
          <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" required autoFocus />
        </Field>
        <Field label="التاريخ">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label={kind === 'capital_in' ? 'انحط بالصندوق' : 'طلع من الصندوق'}>
          <select value={f.cash} onChange={(e) => setF({ ...f, cash: e.target.value })}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ملاحظة">
          <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
        </Field>
        <div className="button-row wide">
          <button className="primary" disabled={busy}>
            تسجيل
          </button>
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** تثبيت أرباح الفترة بحسابات الشركاء الجارية (بعدها بيقدروا يسحبوا منها). */
function DistributeForm({ rows, to, onClose }: { rows: PartnerRow[]; to: string; onClose: () => void }) {
  const { state, call, notify } = useCompany();
  const base = state.info!.baseCurrency;
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.partner.id, r.profitShare > 0 ? toInput(state, r.profitShare, base) : ''])));
  const [date, setDate] = useState(to);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="توزيع أرباح الفترة" onClose={onClose} width={560}>
      <p className="muted">نصيب كل شريك محسوب من ربح الفترة ونسبته. فيك تعدّل المبالغ قبل التثبيت. بعد التثبيت بيصير المبلغ برصيده الجاري، والسحوبات من الأرباح بتنقص منه.</p>
      <table className="table compact">
        <tbody>
          {rows.map((r) => (
            <tr key={r.partner.id}>
              <td>
                {r.partner.name} <small className="muted">({pct(r.profitPct)})</small>
              </td>
              <td>
                <input className="num-input" value={amounts[r.partner.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [r.partner.id]: e.target.value })} inputMode="decimal" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label="تاريخ التوزيع">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              let n = 0;
              for (const r of rows) {
                const text = amounts[r.partner.id]?.trim();
                if (!text) continue;
                const amount = parseAmount(state, text, base);
                if (amount > 0 && (await call('partnerMove', { partnerId: r.partner.id, kind: 'profit_share', amount, date, memo: 'أرباح الفترة' }))) n++;
              }
              notify(`تم توزيع الأرباح على ${n} شريك`);
              onClose();
            } catch (err) {
              notify((err as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          تثبيت التوزيع
        </button>
        <button onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

function PartnerDetails({ partner, row, onClose, onEdit, onVoid }: { partner: Partner; row: PartnerRow | undefined; onClose: () => void; onEdit: () => void; onVoid: (entryId: string) => void }) {
  const { state, can } = useCompany();
  const moves = partnerMoves(state, partner.id);
  let capital = 0;
  const withCapital = moves.map((m) => {
    if (!m.voided) capital += m.kind === 'capital_in' ? m.amount : m.kind === 'capital_out' ? -m.amount : 0;
    return { ...m, capital };
  });
  return (
    <Modal title={partner.name} onClose={onClose} width={820}>
      <div className="toolbar no-print">
        {can('partners.manage') && <button onClick={onEdit}>تعديل البيانات</button>}
        <PrintButtons kind="report" name={`كشف الشريك ${partner.name}`} papers={['a4', 'a5']} />
      </div>
      <div className="print-area">
        <DocHeader title={`كشف حساب الشريك: ${partner.name}`}>{partner.phone && <div className="ltr">{partner.phone}</div>}</DocHeader>
        {row && (
          <div className="kv partner-kv">
            <span>رأس المال</span>
            <strong>{money(state, row.capital)}</strong>
            <span>نسبته من رأس المال</span>
            <strong>{pct(row.capitalPct)}</strong>
            <span>نسبته من الأرباح</span>
            <strong>{pct(row.profitPct)}</strong>
            <span>الأرباح الموزّعة إلو</span>
            <strong>{money(state, row.distributed)}</strong>
            <span>كل سحوباته من الأرباح</span>
            <strong>{money(state, row.withdrawnTotal)}</strong>
            <span>رصيده الجاري</span>
            <strong className={row.current >= 0 ? 'good' : 'bad'}>{money(state, row.current)}</strong>
          </div>
        )}
        {partner.notes && <p className="muted">{partner.notes}</p>}
        {moves.length === 0 ? (
          <Empty>ما في حركات</Empty>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الحركة</th>
                <th className="num">المبلغ</th>
                <th className="num">رأس ماله بعدها</th>
                <th>البيان</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {withCapital.map((m) => (
                <tr key={m.entryId} className={m.voided ? 'voided' : ''}>
                  <td>{dateText(m.date)}</td>
                  <td>
                    {PARTNER_MOVE_NAMES[m.kind]}
                    {m.voided && <small className="bad"> (ملغاة)</small>}
                  </td>
                  <td className={`num ${m.kind === 'capital_in' || m.kind === 'profit_share' ? 'good' : 'bad'}`}>{money(state, m.amount)}</td>
                  <td className="num">{money(state, m.capital)}</td>
                  <td className="muted">{m.memo.replace(/^[^—]*— [^:]*:?\s*/, '')}</td>
                  <td className="no-print">
                    {!m.voided && can('partners.manage') && (
                      <button className="ghost" onClick={() => onVoid(m.entryId)}>
                        إلغاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
