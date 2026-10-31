import React from 'react';
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, Fonts, font, lerp, Logo, sec } from './kit';

export const TOTAL = sec(151.5);

// ───────────── عناصر عامة
const Bg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at ${55 + Math.sin(f / 150) * 10}% ${40 + Math.cos(f / 170) * 8}%, #0f4a38, ${C.deep} 72%)` }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#ffffff10 1.5px, transparent 1.5px)', backgroundSize: '44px 44px', transform: `translateY(${(f * 0.3) % 44}px)` }} />
      <div style={{ position: 'absolute', left: -300, bottom: -300, width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${C.mint}22, transparent 65%)` }} />
      <div style={{ position: 'absolute', right: -250, top: -250, width: 800, height: 800, borderRadius: '50%', background: `radial-gradient(circle, ${C.gold}18, transparent 65%)` }} />
    </AbsoluteFill>
  );
};

/** شاشة بصورة وكاميرا بتقرّب على مستطيل (بإحداثيات الصورة). */
type Cam = { x: number; y: number; w: number; h: number };
const Screen: React.FC<{ src: string; iw: number; ih: number; vw: number; vh: number; cam?: Cam; ring?: Cam | null; ringOn?: number }> = ({ src, iw, ih, vw, vh, cam, ring, ringOn = 1 }) => {
  const c = cam ?? { x: 0, y: 0, w: iw, h: ih };
  const s = Math.max(vw / c.w, vh / c.h);
  const tx = -c.x * s + (vw - c.w * s) / 2;
  const ty = -c.y * s + (vh - c.h * s) / 2;
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'relative', width: vw, height: vh, overflow: 'hidden', background: '#f3f4f6' }}>
      <Img src={staticFile(src)} style={{ position: 'absolute', left: tx, top: ty, width: iw * s, height: ih * s }} />
      {ring && ringOn > 0 && (
        <div style={{ position: 'absolute', left: tx + ring.x * s - 10, top: ty + ring.y * s - 10, width: ring.w * s + 20, height: ring.h * s + 20, borderRadius: 16, border: `5px solid ${C.gold}`, boxShadow: `0 0 0 ${6 + Math.sin(f / 5) * 4}px ${C.gold}44, 0 0 40px ${C.gold}88`, opacity: ringOn }} />
      )}
    </div>
  );
};
const mixCam = (a: Cam, b: Cam, t: number): Cam => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

const Laptop: React.FC<{ w?: number; children: React.ReactNode; style?: React.CSSProperties; off?: number }> = ({ w = 1150, children, style, off = 0 }) => {
  const vh = (w - 28) * (9 / 16);
  return (
    <div style={{ width: w, ...style }}>
      <div style={{ borderRadius: 26, padding: 14, background: 'linear-gradient(145deg,#2b3a35,#0a0f0d)', boxShadow: '0 50px 110px #000b', position: 'relative' }}>
        <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', height: vh }}>
          {children}
          <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: off }} />
        </div>
      </div>
      <div style={{ height: 24, margin: '0 -44px', borderRadius: '0 0 44px 44px', background: 'linear-gradient(#c3ccc8,#7b8883)' }} />
    </div>
  );
};
const LW = (w = 1150) => ({ vw: w - 28, vh: (w - 28) * (9 / 16) });

const Phone: React.FC<{ w?: number; children: React.ReactNode; style?: React.CSSProperties; ios?: boolean }> = ({ w = 400, children, style, ios }) => {
  const vh = w * 2.05;
  const b = w * 0.035;
  return (
    <div style={{ position: 'relative', width: w + b * 2, height: vh + b * 2, borderRadius: w * 0.14, padding: b, background: ios ? 'linear-gradient(145deg,#dfe3e6,#9aa3aa)' : 'linear-gradient(145deg,#2b3a35,#0a0f0d)', boxShadow: '0 50px 110px #000b', ...style }}>
      <div style={{ width: w, height: vh, borderRadius: w * 0.11, overflow: 'hidden', position: 'relative', background: '#fff' }}>{children}</div>
      <div style={{ position: 'absolute', top: b + w * 0.025, left: '50%', width: w * 0.28, height: w * 0.065, marginLeft: -w * 0.14, borderRadius: 30, background: '#05110d' }} />
    </div>
  );
};
const PW = (w = 400) => ({ vw: w, vh: w * 2.05 });

/** شارة الخطوة فوق */
const Step: React.FC<{ n?: string; title: string; sub?: string }> = ({ n, title, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ position: 'absolute', top: 56, right: 80, display: 'flex', alignItems: 'center', gap: 22, direction: 'rtl', opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
      {n && <div style={{ width: 84, height: 84, borderRadius: 24, background: `linear-gradient(135deg, ${C.gold}, #ffdf8a)`, color: C.deep, fontFamily: font, fontWeight: 700, fontSize: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 40px ${C.gold}55` }}>{n}</div>}
      <div style={{ fontFamily: font, color: '#fff' }}>
        <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
        {sub && <div style={{ fontSize: 28, opacity: 0.75 }}>{sub}</div>}
      </div>
    </div>
  );
};

/** بطاقة نقطة/تعليمة جانبية */
const Note: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; tone?: string; icon?: string }> = ({ at, children, style, tone = C.mint, icon }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - sec(at), fps, config: { damping: 15, stiffness: 130 } });
  if (f < sec(at)) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, direction: 'rtl', fontFamily: font, fontSize: 32, fontWeight: 700, color: '#fff', background: '#ffffff12', border: `2px solid ${tone}`, borderRadius: 20, padding: '13px 24px', boxShadow: `0 14px 40px #0006`, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, ...style }}>
      {icon && <span style={{ minWidth: 56, height: 56, borderRadius: 16, background: tone, color: C.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>{icon}</span>}
      <span>{children}</span>
    </div>
  );
};

const Fade: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(1, f / 10, (len - f) / 10);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
const Scene: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => (
  <Sequence from={sec(from)} durationInFrames={sec(to - from)}>
    <Fade len={sec(to - from)}>{children}</Fade>
  </Sequence>
);
/** وقت محلي بالثواني داخل المشهد */
const useT = () => useCurrentFrame() / 30;

// ───────────── المشاهد
const S1: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const lp = spring({ frame: f - 3, fps, config: { damping: 11 } });
  const dev = lerp(t, 4.6, 6, 0, 1);
  const link = lerp(t, 7.5, 9.5, 0, 1);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 120 - dev * 40, left: 0, right: 0, textAlign: 'center', transform: `scale(${1 - dev * 0.25})` }}>
        <div style={{ display: 'inline-block', transform: `scale(${lp})` }}>
          <Logo size={190} />
        </div>
        <div style={{ fontFamily: font, fontWeight: 700, fontSize: 100, color: '#fff', marginTop: 20, opacity: lerp(t, 1.2, 1.8, 0, 1) }}>الاتصال عن بعد</div>
        <div style={{ fontFamily: font, fontSize: 40, color: C.gold, opacity: lerp(t, 2, 2.6, 0, 1) }}>شرح كامل · برنامج وزن</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 140, opacity: dev, transform: `translateY(${(1 - dev) * 80}px)`, direction: 'ltr' }}>
        <Phone w={150}><Screen src="i-dash.png" iw={1170} ih={1992} {...PW(150)} cam={{ x: 0, y: 0, w: 1170, h: 1992 }} /></Phone>
        <Laptop w={560}><Screen src="d-dash.png" iw={1600} ih={900} {...LW(560)} /></Laptop>
        <Phone w={150}><Screen src="a-dash.png" iw={780} ih={1688} {...PW(150)} cam={{ x: 0, y: 0, w: 780, h: 1600 }} /></Phone>
      </div>
      <svg style={{ position: 'absolute', left: 0, top: 0 }} width={1920} height={1080}>
        {[[560, 760], [1360, 760]].map(([x], i) => (
          <line key={i} x1={i ? 1400 : 520} y1={760} x2={i ? 1330 : 600} y2={760} stroke={C.mint} strokeWidth={0} />
        ))}
        <path d={`M 520 720 Q 700 ${640 - link * 60} 760 700`} stroke={C.mint} strokeWidth={5} fill="none" strokeDasharray="14 12" strokeDashoffset={-f * 1.5} opacity={link} />
        <path d={`M 1400 720 Q 1220 ${640 - link * 60} 1160 700`} stroke={C.mint} strokeWidth={5} fill="none" strokeDasharray="14 12" strokeDashoffset={-f * 1.5} opacity={link} />
      </svg>
      <div style={{ position: 'absolute', bottom: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 26 }}>
        <Note at={5.6} icon="⌂">من البيت</Note>
        <Note at={6.6} icon="✈">من السفر</Note>
        <Note at={10.2} icon="✓">مبيعات · ديون · فواتير</Note>
      </div>
    </AbsoluteFill>
  );
};

const S2: React.FC = () => (
  <AbsoluteFill>
    <Step title="قبل ما تبلّش" sub="شغلتين بس" />
    <div style={{ position: 'absolute', top: 300, left: 160, right: 160, display: 'flex', gap: 60, direction: 'rtl' }}>
      <Card at={0.2} icon="★" title="خدمة اختيارية" lines={['بتنفتح لترخيصك من عنا', 'إذا ما فتحت معك: راسلنا عالواتساب ومنفعّلها']} />
      <Card at={4.2} icon="⇅" title="إنترنت" lines={['عالجهاز الرئيسي', 'وعالجوال أو الكمبيوتر التاني']} tone={C.gold} />
    </div>
  </AbsoluteFill>
);
const Card: React.FC<{ at: number; icon: string; title: string; lines: string[]; tone?: string }> = ({ at, icon, title, lines, tone = C.mint }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - sec(at), fps, config: { damping: 14 } });
  return (
    <div style={{ flex: 1, background: '#ffffff10', border: `3px solid ${tone}`, borderRadius: 40, padding: '50px 54px', fontFamily: font, color: '#fff', opacity: p, transform: `translateY(${(1 - p) * 60}px) scale(${0.9 + p * 0.1})`, boxShadow: `0 30px 80px #0007` }}>
      <div style={{ width: 110, height: 110, borderRadius: 30, background: tone, color: C.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, marginBottom: 30 }}>{icon}</div>
      <div style={{ fontSize: 64, fontWeight: 700, marginBottom: 18 }}>{title}</div>
      {lines.map((l) => (
        <div key={l} style={{ fontSize: 38, opacity: 0.85, lineHeight: 1.6 }}>• {l}</div>
      ))}
    </div>
  );
};

// المشهد 3: الجهاز الرئيسي (29.9 → 52.2) — وقت محلي من 29.9
const S3: React.FC = () => {
  const t = useT();
  const L = LW(1240);
  const full: Cam = { x: 0, y: 0, w: 1600, h: 900 };
  const side: Cam = { x: 1380, y: 600, w: 220, h: 170 };
  const tabs: Cam = { x: 330, y: 60, w: 1040, h: 585 };
  const qr: Cam = { x: 330, y: 270, w: 1010, h: 568 };
  const qrTight: Cam = { x: 600, y: 330, w: 760, h: 428 };
  // التسلسل: لوحة → سايدبار الإعدادات (8.4) → التبويب (10) → التفعيل (12.1) → الرمز (13.7) → التحذير (16.6)
  let src = 'd-dash.png', cam = full, ring: Cam | null = null;
  if (t >= 7.9) { src = 'd-settings.png'; cam = mixCam(full, side, lerp(t, 8, 8.8, 0, 1)); ring = { x: 1395, y: 706, w: 193, h: 42 }; }
  if (t >= 9.8) { src = 'd-remote-off.png'; cam = mixCam(side, tabs, lerp(t, 9.8, 10.6, 0, 1)); ring = { x: 521, y: 112, w: 115, h: 39 }; }
  if (t >= 12) { ring = { x: 1160, y: 268, w: 170, h: 30 }; }
  if (t >= 13.6) { src = 'd-remote-on.png'; cam = mixCam(tabs, qr, lerp(t, 13.6, 14.4, 0, 1)); ring = { x: 1145, y: 308, w: 180, h: 180 }; }
  if (t >= 15) { ring = { x: 345, y: 372, w: 260, h: 52 }; }
  if (t >= 16.6) { cam = mixCam(qr, qrTight, lerp(t, 16.6, 17.4, 0, 1)); ring = { x: 730, y: 545, w: 600, h: 26 }; }
  return (
    <AbsoluteFill>
      <Step n="١" title="الجهاز الرئيسي" sub="الكمبيوتر أو الجوال اللي عليه بيانات المحل" />
      <div style={{ position: 'absolute', left: 90, top: 250 }}>
        <Laptop w={1240}>
          <Screen src={src} iw={1600} ih={900} {...L} cam={cam} ring={ring} />
        </Laptop>
      </div>
      <div style={{ position: 'absolute', right: 70, top: 250, width: 470, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Note at={6.3} icon="١">افتح البرنامج</Note>
        <Note at={8.4} icon="٢">الإعدادات</Note>
        <Note at={10} icon="٣">الاتصال عن بعد</Note>
        <Note at={12.1} icon="٤">اكبس «تفعيل»</Note>
        <Note at={13.7} icon="▦" tone={C.gold}>رمز + كود QR</Note>
        <Note at={16.6} icon="!" tone={C.red}>الرمز مفتاح محلك: لا تعطيه لحدا</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 4: أندرويد (53.3 → 74.0) — وقت محلي من 53.3
const S4: React.FC = () => {
  const t = useT();
  const P = PW(430);
  const f = useCurrentFrame();
  let src = 'a-start.png', cam: Cam = { x: 0, y: 0, w: 780, h: 1600 }, ring: Cam | null = null;
  if (t >= 3.9) { src = 'a-connect-empty.png'; cam = { x: 0, y: 88, w: 780, h: 1600 }; ring = null; }
  if (t >= 8.2) { src = 'a-connect-filled.png'; cam = { x: 0, y: 88, w: 780, h: 1600 }; ring = { x: 54, y: 1272, w: 672, h: 92 }; }
  if (t >= 13.8) { ring = { x: 54, y: 1440, w: 672, h: 250 }; }
  if (t >= 17.2) { src = 'a-dash.png'; cam = { x: 0, y: 0, w: 780, h: 1600 }; ring = null; }
  const qrIn = lerp(t, 8, 8.8, 0, 1);
  return (
    <AbsoluteFill>
      <Step n="٢" title="الربط من جوال أندرويد" />
      <div style={{ position: 'absolute', left: 300, top: 160 }}>
        <Phone w={430}>
          <Screen src={src} iw={780} ih={1688} {...P} cam={cam} ring={ring} />
        </Phone>
      </div>
      {/* كود QR من شاشة المحل */}
      <div style={{ position: 'absolute', left: 900, top: 330, opacity: qrIn * (1 - lerp(t, 13.5, 14, 0, 1)), transform: `scale(${0.8 + qrIn * 0.2})` }}>
        <div style={{ background: '#fff', borderRadius: 28, padding: 22, boxShadow: '0 30px 80px #0008' }}>
          <Img src={staticFile('qr.png')} style={{ width: 300, height: 300, display: 'block' }} />
        </div>
        <div style={{ fontFamily: font, color: '#fff', fontSize: 30, textAlign: 'center', marginTop: 14 }}>من شاشة الجهاز الرئيسي</div>
        <div style={{ position: 'absolute', left: 22, right: 22, top: 22 + ((f * 6) % 300), height: 4, background: C.mint, boxShadow: `0 0 20px ${C.mint}` }} />
      </div>
      <div style={{ position: 'absolute', right: 70, top: 260, width: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Note at={0.2} icon="↓">نزّل التطبيق من waznsy.com</Note>
        <Note at={3.9} icon="١">اكبس «اتصال عن بعد»</Note>
        <Note at={8.2} icon="▦" tone={C.gold}>امسح الـ QR أو اكتب الرمز</Note>
        <Note at={13.8} icon="٢">اسم المستخدم وكلمة السر</Note>
        <Note at={17.3} icon="✓">صرت شايف المحل من جوالك</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 5: آيفون (74.8 → 89.7)
const S5: React.FC = () => {
  const t = useT();
  const P = PW(430);
  const f = useCurrentFrame();
  const camOn = t >= 3.1 && t < 7.1;
  let src = 'i-connect.png', ring: Cam | null = { x: 250, y: 1285, w: 840, h: 140 };
  if (t >= 11) { src = 'i-connect-filled.png'; ring = { x: 80, y: 1540, w: 1010, h: 390 }; }
  if (t >= 13) { src = 'i-dash.png'; ring = null; }
  return (
    <AbsoluteFill>
      <Step n="٣" title="الربط من الآيفون" sub="بدون تنزيل أي تطبيق" />
      <div style={{ position: 'absolute', left: 300, top: 160 }}>
        <Phone w={430} ios>
          {camOn ? (
            <div style={{ width: P.vw, height: P.vh, background: '#111', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 65, top: 260, background: '#fff', padding: 14, borderRadius: 16, transform: `scale(${1 + lerp(t, 3.1, 5, 0, 0.08)})` }}>
                <Img src={staticFile('qr.png')} style={{ width: 270, height: 270, display: 'block' }} />
              </div>
              {['0,0', '1,0', '0,1', '1,1'].map((k) => {
                const [a, b] = k.split(',').map(Number);
                return <div key={k} style={{ position: 'absolute', left: 50 + a! * 270, top: 245 + b! * 270, width: 60, height: 60, borderColor: '#ffd84a', borderStyle: 'solid', borderWidth: `${b ? 0 : 6}px ${a ? 6 : 0}px ${b ? 6 : 0}px ${a ? 0 : 6}px` }} />;
              })}
              <div style={{ position: 'absolute', left: 30, right: 30, bottom: 120 - lerp(t, 4.5, 5.2, 0, 1) * 20, opacity: lerp(t, 4.5, 5.2, 0, 1), background: '#ffffffee', borderRadius: 18, padding: '16px 20px', fontFamily: font, fontSize: 22, color: '#111', direction: 'ltr' }}>
                Safari · waznsy.com/app
              </div>
              <div style={{ position: 'absolute', bottom: 30, left: '50%', width: 70, height: 70, marginLeft: -35, borderRadius: '50%', border: '5px solid #fff' }} />
              <div style={{ position: 'absolute', top: 60, width: '100%', textAlign: 'center', fontFamily: font, color: '#ffd84a', fontSize: 22, opacity: 0.6 + Math.sin(f / 6) * 0.4 }}>الكاميرا</div>
            </div>
          ) : (
            <Screen src={src} iw={1170} ih={1992} {...P} cam={{ x: 0, y: 0, w: 1170, h: 1992 }} ring={ring} />
          )}
        </Phone>
      </div>
      <div style={{ position: 'absolute', right: 70, top: 260, width: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Note at={0.2} icon="✓">ما بدها تطبيق</Note>
        <Note at={3.2} icon="◉">افتح الكاميرا ووجّهها عالـ QR</Note>
        <Note at={7.1} icon="↗" tone={C.gold}>بيفتح سفاري والرمز معبّى</Note>
        <Note at={11} icon="٢">اسم المستخدم وكلمة السر</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 6: كمبيوتر تاني (91 → 102.6)
const S6: React.FC = () => {
  const t = useT();
  const L = LW(1240);
  let src = 'h-start.png', cam: Cam = { x: 0, y: 0, w: 1600, h: 900 }, ring: Cam | null = null;
  if (t >= 4.6) { src = 'h-connect.png'; cam = mixCam({ x: 0, y: 0, w: 1600, h: 900 }, { x: 380, y: 380, w: 840, h: 473 }, lerp(t, 4.6, 5.4, 0, 1)); ring = { x: 490, y: 640, w: 606, h: 110 }; }
  return (
    <AbsoluteFill>
      <Step n="٤" title="من كمبيوتر تاني" sub="متل كمبيوتر البيت" />
      <div style={{ position: 'absolute', left: 90, top: 250 }}>
        <Laptop w={1240}>
          <Screen src={src} iw={1600} ih={900} {...L} cam={cam} ring={ring} />
        </Laptop>
      </div>
      <div style={{ position: 'absolute', right: 70, top: 320, width: 470, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Note at={4.6} icon="١">افتح وزن ← «اتصال عن بعد»</Note>
        <Note at={6.6} icon="٢">اكتب الرمز</Note>
        <Note at={8.4} icon="٣">ادخل بحسابك</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 7: بعد أول مرة (103.7 → 110.6)
const S7: React.FC = () => {
  const L = LW(1240);
  return (
    <AbsoluteFill>
      <Step n="٥" title="بعد أول مرة" sub="ما في داعي للرمز" />
      <div style={{ position: 'absolute', left: 90, top: 250 }}>
        <Laptop w={1240}>
          <Screen src="h-again.png" iw={1600} ih={900} {...L} cam={{ x: 380, y: 360, w: 840, h: 473 }} ring={{ x: 480, y: 470, w: 640, h: 300 }} />
        </Laptop>
      </div>
      <div style={{ position: 'absolute', right: 70, top: 380, width: 470 }}>
        <Note at={0.4} icon="★" tone={C.gold}>كلمة السر بس</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 8: الصلاحيات والأمان (111.4 → 126.4)
const S8: React.FC = () => {
  const t = useT();
  const P = PW(330);
  const f = useCurrentFrame();
  const lock = lerp(t, 7.6, 8.4, 0, 1);
  return (
    <AbsoluteFill>
      <Step title="الصلاحيات والأمان" />
      <div style={{ position: 'absolute', left: 170, top: 210, display: 'flex', gap: 70, alignItems: 'flex-end', opacity: 1 - lock * 0.85, direction: 'rtl' }}>
        <div style={{ textAlign: 'center' }}>
          <Phone w={330}><Screen src="a-dash.png" iw={780} ih={1688} {...P} cam={{ x: 0, y: 0, w: 780, h: 1600 }} /></Phone>
          <div style={{ fontFamily: font, color: '#fff', fontSize: 34, marginTop: 16, fontWeight: 700 }}>المدير: بيشوف كل شي</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Phone w={330}><Screen src="c-dash.png" iw={780} ih={1688} {...P} cam={{ x: 0, y: 0, w: 780, h: 1600 }} /></Phone>
          <div style={{ fontFamily: font, color: C.gold, fontSize: 34, marginTop: 16, fontWeight: 700 }}>الكاشير: شغله بس</div>
        </div>
      </div>
      {lock > 0 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: lock }}>
          <svg width={340} height={340} viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `scale(${0.9 + Math.sin(f / 8) * 0.04})`, filter: `drop-shadow(0 0 30px ${C.mint})` }}>
            <path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z" fill={`${C.mint}22`} />
            <rect x="9" y="10.5" width="6" height="5" rx="1" />
            <path d="M10 10.5V9a2 2 0 0 1 4 0v1.5" />
          </svg>
          <div style={{ fontFamily: font, fontWeight: 700, fontSize: 76, color: '#fff', marginTop: 20 }}>كل البيانات مشفّرة</div>
          <div style={{ fontFamily: font, fontSize: 40, color: '#ffffffcc' }}>من جهاز لجهاز… ما حدا بيشوفها، لا نحنا ولا غيرنا</div>
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', right: 70, top: 330, width: 520, opacity: 1 - lock }}>
        <Note at={0.3} icon="✓">كل واحد بحسابه وصلاحياته</Note>
      </div>
    </AbsoluteFill>
  );
};

// المشهد 9: الجهاز الرئيسي مطفي (127.3 → 137.6)
const S9: React.FC = () => {
  const t = useT();
  const L = LW(820);
  const P = PW(400);
  const off = lerp(t, 0.8, 2, 0, 1);
  return (
    <AbsoluteFill>
      <Step title="إذا الجهاز الرئيسي انطفى" />
      <div style={{ position: 'absolute', left: 980, top: 230, opacity: 1 - lerp(t, 3, 4, 0, 0.5) }}>
        <Laptop w={820} off={off * 0.92}>
          <Screen src="d-dash.png" iw={1600} ih={900} {...L} />
        </Laptop>
        <div style={{ textAlign: 'center', fontFamily: font, color: C.red, fontSize: 38, fontWeight: 700, marginTop: 18, opacity: off }}>⏻ مطفي</div>
      </div>
      <div style={{ position: 'absolute', left: 250, top: 160 }}>
        <Phone w={400}>
          <Screen src="a-offline.png" iw={780} ih={1688} {...P} cam={{ x: 0, y: 0, w: 780, h: 1600 }} ring={t > 1.5 ? { x: 24, y: 165, w: 732, h: 198 } : null} />
        </Phone>
      </div>
      <div style={{ position: 'absolute', left: 980, top: 820, width: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Note at={1.8} icon="◉">بتضل تشوف آخر نسخة وصلتك</Note>
        <Note at={4.3} icon="↻" tone={C.gold}>الفواتير بتنحفظ وبتتسجّل لما يرجع</Note>
      </div>
    </AbsoluteFill>
  );
};

const S10: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const lp = spring({ frame: f - 3, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ marginTop: 110, transform: `scale(${lp})` }}>
        <Logo size={220} />
      </div>
      <div style={{ fontFamily: font, fontWeight: 700, fontSize: 96, color: '#fff', marginTop: 26 }}>محلك بجيبك</div>
      <div style={{ display: 'flex', gap: 40, marginTop: 50, opacity: lerp(t, 4.4, 5.2, 0, 1), transform: `translateY(${(1 - lerp(t, 4.4, 5.2, 0, 1)) * 30}px)` }}>
        {['+963 968 037 609', '+963 980 072 891'].map((n) => (
          <div key={n} style={{ fontFamily: font, fontWeight: 700, fontSize: 60, color: '#fff', direction: 'ltr', background: '#25d36622', border: '4px solid #25d366', borderRadius: 999, padding: '14px 56px' }}>{n}</div>
        ))}
      </div>
      <div style={{ fontFamily: font, fontWeight: 700, fontSize: 52, color: C.mint, marginTop: 34, direction: 'ltr', opacity: lerp(t, 5.4, 6, 0, 1) }}>waznsy.com</div>
      <div style={{ fontFamily: font, fontSize: 46, color: C.gold, marginTop: 30, opacity: lerp(t, 8.3, 9, 0, 1) }}>وزن… حسابك موزون</div>
    </AbsoluteFill>
  );
};

export const Tutorial: React.FC = () => (
  <AbsoluteFill style={{ background: C.deep }}>
    <Fonts />
    <Bg />
    <Scene from={0} to={17.2}><S1 /></Scene>
    <Scene from={17.1} to={29.6}><S2 /></Scene>
    <Scene from={29.5} to={52.6}><Shift by={0.4}><S3 /></Shift></Scene>
    <Scene from={52.5} to={74.3}><Shift by={0.8}><S4 /></Shift></Scene>
    <Scene from={74.2} to={90.5}><Shift by={0.6}><S5 /></Shift></Scene>
    <Scene from={90.4} to={103.3}><Shift by={0.6}><S6 /></Shift></Scene>
    <Scene from={103.2} to={111.0}><Shift by={0.5}><S7 /></Shift></Scene>
    <Scene from={110.9} to={126.9}><Shift by={0.5}><S8 /></Shift></Scene>
    <Scene from={126.8} to={137.8}><Shift by={0.5}><S9 /></Shift></Scene>
    <Scene from={137.7} to={151.5}><Shift by={0.4}><S10 /></Shift></Scene>
  </AbsoluteFill>
);
/** المشهد بيبدأ قبل الكلام بشوي: نحسب الوقت المحلي من بداية الكلام */
const Shift: React.FC<{ by: number; children: React.ReactNode }> = ({ by, children }) => <Sequence from={sec(by)}>{children}</Sequence>;
