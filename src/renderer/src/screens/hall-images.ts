import { BOOKING_STATUS_NAMES, HALL_PERIODS, bookingDeposits, bookingHours, bookingTotals, hallNames, type CompanyState, type HallBooking } from '../../../core';

// صور الواتساب لصالة الأفراح: بطاقة الحجز (تأكيد أو تذكير) وجدول الحجوزات، مرسومة على canvas بخط Cairo.

export interface ShareImage {
  png: Uint8Array;
  dataUrl: string;
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayName = (d: string) => DAYS[new Date(d + 'T12:00:00Z').getUTCDay()]!;
const dmy = (d: string) => d.split('-').reverse().join('/');
const PINK = '#b0457a';
const INK = '#1d2433';
const MUTED = '#6b7385';

async function fonts() {
  await Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 32px Cairo`).catch(() => null)));
}

type Text = { s?: number; w?: number; c?: string; a?: CanvasTextAlign; ltr?: boolean; max?: number };
function painter(x: CanvasRenderingContext2D) {
  const fit = (t: string, max: number) => {
    if (x.measureText(t).width <= max) return t;
    let s = t;
    while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  };
  return {
    text(t: string, px: number, py: number, o: Text = {}) {
      x.save();
      x.font = `${o.w ?? 700} ${o.s ?? 30}px Cairo, sans-serif`;
      x.fillStyle = o.c ?? INK;
      x.textAlign = o.a ?? 'right';
      x.direction = o.ltr ? 'ltr' : 'rtl';
      x.fillText(o.max ? fit(String(t), o.max) : String(t), px, py);
      x.restore();
    },
    box(px: number, py: number, w: number, h: number, r: number, fill: string) {
      x.beginPath();
      x.roundRect(px, py, w, h, r);
      x.fillStyle = fill;
      x.fill();
    },
  };
}

async function finish(cv: HTMLCanvasElement): Promise<ShareImage> {
  const dataUrl = cv.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]!);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, dataUrl };
}

/** بطاقة الحجز: المناسبة والموعد والصالة، ومع المبالغ (القيمة والعربون والباقي) إذا بدك. */
export async function bookingImage(state: CompanyState, b: HallBooking, o: { today: string; amounts: boolean; fmt: (minor: number) => string }): Promise<ShareImage> {
  await fonts();
  const party = state.parties[b.partyId];
  const days = Math.round((Date.parse(b.date) - Date.parse(o.today)) / 864e5);
  const reminder = days >= 0 && days <= 3;
  const hours = bookingHours(b);
  const rows: [string, string][] = [
    ['اليوم', `${dayName(b.date)} ${dmy(b.date)}`],
    ['الموعد', `${HALL_PERIODS[b.period]}${hours ? ` · ${hours}` : ''}`],
    ['الصالة', b.hall],
  ];
  if (b.extras) rows.push(['الإضافات', b.extras]);
  if (b.guests) rows.push(['عدد الضيوف', String(b.guests)]);
  rows.push(['باسم', party?.name ?? ''], ['رقم الحجز', String(b.number)]);
  const t = bookingTotals(b).total, dep = bookingDeposits(state, b), left = Math.max(0, t - dep);
  const W = 1080, P = 70;
  const H = 420 + rows.length * 84 + 40 + (o.amounts ? 300 : 0) + 190;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = cv.getContext('2d')!;
  const { text, box } = painter(x);
  const R = W - P;
  x.fillStyle = '#f7f3f5';
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 330);
  g.addColorStop(0, '#7d2a55');
  g.addColorStop(1, PINK);
  x.fillStyle = g;
  x.fillRect(0, 0, W, 330);
  x.globalAlpha = 0.08;
  x.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.arc(140 + i * 50, 40 + i * 30, 150 + i * 55, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  text(state.info?.name ?? '', R, 100, { s: 40, c: '#fff', max: 640 });
  box(P, 62, 300, 60, 30, 'rgba(255,255,255,0.18)');
  text(reminder ? (days === 0 ? 'تذكير: اليوم' : days === 1 ? 'تذكير: بكرا' : `تذكير: بعد ${days} أيام`) : 'تأكيد حجز', P + 150, 103, { s: 30, c: '#fff', a: 'center' });
  text(b.eventType, R, 200, { s: 64, c: '#fff', max: W - 2 * P });
  if (b.title) text(b.title, R, 270, { s: 42, w: 400, c: 'rgba(255,255,255,0.92)', max: W - 2 * P });
  // التفاصيل
  let y = 370;
  box(P, y, W - 2 * P, rows.length * 84 + 30, 28, '#fff');
  y += 15;
  rows.forEach(([k, v], i) => {
    if (i) {
      x.fillStyle = '#eee5ea';
      x.fillRect(P + 36, y, W - 2 * P - 72, 2);
    }
    text(k, R - 36, y + 56, { s: 30, c: MUTED });
    text(v, P + 36, y + 56, { s: 34, a: 'left', max: 620 });
    y += 84;
  });
  y += 55;
  if (o.amounts) {
    const cols: [string, string, string][] = [
      ['قيمة الحجز', o.fmt(t), INK],
      ['العربون المدفوع', o.fmt(dep), '#128a5c'],
      ['الباقي', o.fmt(left), left > 0 ? '#c0392b' : '#128a5c'],
    ];
    const cw = (W - 2 * P - 40) / 3;
    cols.forEach(([k, v, c], i) => {
      const bx = R - (i + 1) * cw - i * 20;
      box(bx, y, cw, 210, 26, '#fff');
      text(k, bx + cw / 2, y + 70, { s: 28, c: MUTED, a: 'center' });
      text(v, bx + cw / 2, y + 150, { s: 38, c, a: 'center', max: cw - 30 });
    });
    y += 260;
  }
  // التذييل
  x.fillStyle = PINK;
  x.fillRect(0, H - 130, W, 130);
  text('نتمنى لكم مناسبة سعيدة', R, H - 52, { s: 34, c: '#fff' });
  if (state.info?.phone) text(state.info.phone, P, H - 52, { s: 32, c: '#fff', a: 'left', ltr: true });
  return finish(cv);
}

/** جدول الحجوزات كصورة: مرتّب بالتاريخ، وكل حجز شقد قيمته وشقد دفع عربون وشقد باقي (إذا بدك المبالغ). */
export async function bookingsTableImage(state: CompanyState, list: HallBooking[], o: { title: string; amounts: boolean; fmt: (b: HallBooking, minor: number) => string }): Promise<ShareImage> {
  await fonts();
  const many = hallNames(state).length > 1;
  type Col = { h: string; w: number; v: (b: HallBooking, i: number) => string; c?: (b: HallBooking) => string; ltr?: boolean };
  const cols: Col[] = [
    { h: '#', w: 60, v: (_b, i) => String(i + 1) },
    { h: 'التاريخ', w: 300, v: (b) => `${dayName(b.date)} ${dmy(b.date)}` },
    { h: 'الموعد', w: 300, v: (b) => `${HALL_PERIODS[b.period]}${bookingHours(b) ? ` ${bookingHours(b)}` : ''}` },
    ...(many ? [{ h: 'الصالة', w: 190, v: (b: HallBooking) => b.hall }] : []),
    { h: 'المناسبة', w: 380, v: (b) => `${b.eventType}${b.title ? ` — ${b.title}` : ''}` },
    { h: 'الزبون', w: 260, v: (b) => state.parties[b.partyId]?.name ?? '' },
    { h: 'الإضافات', w: 260, v: (b) => b.extras || '—' },
    { h: 'الحالة', w: 150, v: (b) => BOOKING_STATUS_NAMES[b.status], c: (b) => (b.status === 'cancelled' ? '#c0392b' : b.status === 'tentative' ? '#9a6b12' : '#128a5c') },
    ...(o.amounts
      ? [
          { h: 'القيمة', w: 230, v: (b: HallBooking) => o.fmt(b, bookingTotals(b).total) },
          { h: 'العربون', w: 230, v: (b: HallBooking) => o.fmt(b, bookingDeposits(state, b)), c: () => '#128a5c' },
          { h: 'الباقي', w: 230, v: (b: HallBooking) => o.fmt(b, Math.max(0, bookingTotals(b).total - bookingDeposits(state, b))), c: (b: HallBooking) => (bookingTotals(b).total - bookingDeposits(state, b) > 0 ? '#c0392b' : '#128a5c') },
        ]
      : []),
  ];
  const P = 40, RH = 70, HEAD = 190;
  const W = cols.reduce((s, c) => s + c.w, 0) + 2 * P;
  const live = list.filter((b) => b.status !== 'cancelled' && b.currency === state.info?.baseCurrency);
  const H = HEAD + 64 + list.length * RH + (o.amounts && live.length ? 90 : 0) + 50;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = cv.getContext('2d')!;
  const { text, box } = painter(x);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.fillStyle = PINK;
  x.fillRect(0, 0, W, 150);
  text(state.info?.name ?? '', W - P, 70, { s: 40, c: '#fff' });
  text(o.title, W - P, 122, { s: 28, w: 400, c: 'rgba(255,255,255,0.9)', max: W - 2 * P - 260 });
  text(`${list.length} حجز`, P, 96, { s: 34, c: '#fff', a: 'left' });
  // رأس الجدول
  let y = HEAD;
  box(P, y, W - 2 * P, 64, 14, '#f3e6ed');
  let cx = W - P;
  for (const c of cols) {
    text(c.h, cx - 14, y + 43, { s: 26, c: PINK });
    cx -= c.w;
  }
  y += 64;
  list.forEach((b, i) => {
    const cancelled = b.status === 'cancelled';
    if (i % 2) {
      x.fillStyle = '#faf6f8';
      x.fillRect(P, y, W - 2 * P, RH);
    }
    let cx2 = W - P;
    for (const c of cols) {
      text(c.v(b, i), cx2 - 14, y + 46, { s: 26, w: c.h === 'المناسبة' || c.h === 'التاريخ' ? 700 : 400, c: cancelled && c.h !== 'الحالة' ? '#b0b4bd' : (c.c?.(b) ?? INK), max: c.w - 22 });
      cx2 -= c.w;
    }
    if (cancelled) {
      x.fillStyle = 'rgba(192,57,43,0.35)';
      x.fillRect(P + 90, y + RH / 2, W - 2 * P - 160, 2);
    }
    x.fillStyle = '#efe8ec';
    x.fillRect(P, y + RH - 1, W - 2 * P, 1);
    y += RH;
  });
  // المجموع
  if (o.amounts && live.length) {
    const sum = (f: (b: HallBooking) => number) => live.reduce((s, b) => s + f(b), 0);
    const base = live[0]!;
    box(P, y + 14, W - 2 * P, 62, 14, '#f3e6ed');
    text(`المجموع (${live.length} حجز)`, W - P - 14, y + 56, { s: 26, c: PINK });
    const amt = cols.slice(-3).map((c) => c.w);
    const xs = [P + amt[2]! + amt[1]!, P + amt[2]!, P];
    const vals = [sum((b) => bookingTotals(b).total), sum((b) => bookingDeposits(state, b)), sum((b) => Math.max(0, bookingTotals(b).total - bookingDeposits(state, b)))];
    vals.forEach((v, k) => text(o.fmt(base, v), xs[k]! + amt[k]! - 14, y + 56, { s: 26, c: k === 1 ? '#128a5c' : k === 2 ? '#c0392b' : INK, max: amt[k]! - 22 }));
  }
  return finish(cv);
}
