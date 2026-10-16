import { useEffect, useRef, useState } from 'react';
import { api, useCompany, type CustomerDisplayData } from '../api';
import { Icon } from './icons';

// شاشة الزبون: نافذة على الشاشة التانية بتعرض الطلب الحالي والمبلغ. ما فيها أي بيانات غير اللي بتنبعتلها.

type Payload = Omit<CustomerDisplayData, 'brand'>;

/** بيبعت الطلب الحالي لشاشة الزبون كل ما يتغير (null = ما في طلب، بيطلع الترحيب). */
export function useCustomerDisplay(data: Payload | null): void {
  const { state } = useCompany();
  const r = state.info!.print?.receipt;
  const logo = state.info!.print?.logo;
  const brand = { name: state.info!.name, ...(logo ? { logo } : {}), ...(r?.displayWelcome ? { welcome: r.displayWelcome } : {}) };
  const key = JSON.stringify([data, brand.name, brand.welcome, logo?.length]);
  useEffect(() => {
    const t = setTimeout(() => void api.displayUpdate(data ? { brand, ...data } : { brand, lines: [], totals: [], grand: '' }).catch(() => {}), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // طلعنا من الشاشة: منرجّع الترحيب
  useEffect(() => () => void api.displayUpdate({ brand, lines: [], totals: [], grand: '' }).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** بيبعت «شكراً» مع الباقي بعد الدفع مباشرة. */
export function showThanks(state: ReturnType<typeof useCompany>['state'], grand: string, paid: { received: string; change: string } | null): void {
  const logo = state.info!.print?.logo;
  void api.displayUpdate({ brand: { name: state.info!.name, ...(logo ? { logo } : {}) }, lines: [], totals: [], grand, paid, done: true }).catch(() => {});
}

/** زر فتح/تسكير شاشة الزبون. */
export function CustomerDisplayButton() {
  const { notify } = useCompany();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.displayStatus().then(setOpen).catch(() => {});
  }, []);
  return (
    <button
      className={`ghost ${open ? 'active' : ''}`}
      title="شاشة تانية بيشوف عليها الزبون طلبه والمبلغ"
      onClick={async () => {
        if (open) {
          await api.displayClose().catch(() => {});
          setOpen(false);
          return;
        }
        const r = await api.displayOpen().catch((e: Error) => (notify(e.message, 'error'), null));
        if (!r) return;
        setOpen(true);
        if (!r.secondScreen) notify('ما لقينا شاشة تانية موصولة، انفتحت شاشة الزبون بنافذة عادية — اسحبها لشاشة الزبون');
      }}
    >
      <Icon name="monitor" size={16} /> {open ? 'سكّر شاشة الزبون' : 'شاشة الزبون'}
    </button>
  );
}

/** الصفحة نفسها (بتنفتح بنافذة لحالها: index.html#customer). */
export function CustomerDisplay() {
  const [d, setD] = useState<CustomerDisplayData | null>(null);
  const doneUntil = useRef(0);
  const [now, setNow] = useState(() => new Date());
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset['theme'] = 'dark';
    const off = window.mizan.on('display:update', (p) => {
      const next = p as CustomerDisplayData | null;
      if (next?.done) doneUntil.current = Date.now() + 9000;
      // بعد الدفع منخلي «شكراً» ظاهرة شوي قبل ما نرجع للترحيب
      else if (next && !next.lines.length && Date.now() < doneUntil.current) return;
      setD(next);
    });
    void window.mizan.invoke('display:last').then((p) => setD((cur) => cur ?? (p as CustomerDisplayData | null))).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [d?.lines.length]);
  useEffect(() => {
    if (!d?.done) return;
    const t = setTimeout(() => setD((x) => (x?.done ? { ...x, done: false, lines: [], totals: [], grand: '', paid: null } : x)), 9000);
    return () => clearTimeout(t);
  }, [d]);

  const brand = d?.brand;
  const idle = !d || (!d.done && !d.lines.length);
  return (
    <div className="cdisplay">
      <header>
        <div className="brand">
          {brand?.logo && <img src={brand.logo} alt="" />}
          <strong>{brand?.name ?? ''}</strong>
        </div>
        <span className="clock ltr">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </header>
      {idle && (
        <div className="cd-welcome">
          {brand?.logo && <img src={brand.logo} alt="" />}
          <h1>{brand?.welcome || `أهلاً وسهلاً بكم${brand?.name ? ` في ${brand.name}` : ''}`}</h1>
        </div>
      )}
      {d?.done && (
        <div className="cd-welcome cd-thanks">
          <Icon name="check" size={120} />
          <h1>شكراً لزيارتكم</h1>
          {d.grand && <p>المبلغ: <b className="ltr">{d.grand}</b></p>}
          {d.paid && d.paid.change && (
            <p>
              الباقي إلك: <b className="ltr">{d.paid.change}</b>
            </p>
          )}
        </div>
      )}
      {!idle && !d?.done && d && (
        <div className="cd-order">
          <div className="cd-lines" ref={list}>
            {d.title && <div className="cd-title">{d.title}</div>}
            {d.lines.map((l, i) => (
              <div key={i} className={`cd-line ${i === d.lines.length - 1 ? 'last' : ''}`}>
                <span className="q ltr">{l.qty}×</span>
                <span className="n">
                  {l.name}
                  {l.note && <small>{l.note}</small>}
                </span>
                <span className="t ltr">{l.total}</span>
              </div>
            ))}
          </div>
          <aside className="cd-sum">
            {d.totals.map((t, i) => (
              <div key={i} className="row">
                <span>{t.label}</span>
                <b className="ltr">{t.value}</b>
              </div>
            ))}
            <div className="grand">
              <span>المطلوب</span>
              <b className="ltr">{d.grand}</b>
            </div>
            {d.paid && (
              <>
                <div className="row">
                  <span>المستلم</span>
                  <b className="ltr">{d.paid.received}</b>
                </div>
                <div className="row change">
                  <span>الباقي</span>
                  <b className="ltr">{d.paid.change}</b>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
