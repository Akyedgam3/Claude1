// إعلان وزن — أسلوب «سلس»: كاميرا وحدة ناعمة (2.5D)، خلفية فاتحة، وعناصر البرنامج الحقيقية بتطلع من الشاشة.
// window.render(t) حتمي: كل فريم بيتحدد من t بس.
(() => {
  'use strict';
  const W = 1080, H = 1920, F = 1400;
  const world = document.getElementById('world'), hud = document.getElementById('hud'), bg = document.getElementById('bg');
  const wipe = document.getElementById('wipe'), wipeFg = document.getElementById('wipeFg'), fadeEl = document.getElementById('fade');
  const BOX = window.BOX, SZ = window.IMGSZ;
  window.DURATION = 68.8;

  // ───────── أدوات ─────────
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const eo3 = (x) => 1 - Math.pow(1 - x, 3);
  const eo4 = (x) => 1 - Math.pow(1 - x, 4);
  const ei3 = (x) => x * x * x;
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eioS = (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
  /** نابض ناعم: بيوصل 1 مع ارتداد خفيف (x بالثواني) */
  const spring = (x, damp = 7, freq = 10) => (x <= 0 ? 0 : 1 - Math.exp(-damp * x) * Math.cos(freq * x));
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function track(keys) {
    return (t) => {
      if (t <= keys[0][0]) return keys[0][1];
      for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i]; const p = (t - t0) / (t1 - t0); return v0 + (v1 - v0) * (e ? e(p) : p); }
      return keys[keys.length - 1][1];
    };
  }
  const pending = [];
  function img(name) { const im = new Image(); im.src = `shots/${name}.png`; pending.push(im.decode().catch(() => {})); return im; }

  // ───────── الكاميرا والعناصر ─────────
  const cam = { x: 0, y: 0, z: -F, tiltY: 0, tiltX: 0, roll: 0, focus: F, dofK: 13 };
  const nodes = [];
  class Node {
    constructor(el, w, h, o = {}) {
      this.el = el; this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0; this.k = o.k ?? 1;
      this.rot = o.rot || 0; this.ry = 0; this.rx = 0; this.op = 1; this.blur = 0; this.dof = !!o.dof; this.vis = true; this.zi = o.zi || 0;
      el.classList.add('w'); this.size(w, h); if (!el.parentNode) world.appendChild(el); nodes.push(this);
    }
    size(w, h) { this.w = w; this.h = h; const s = this.el.style; s.width = w + 'px'; s.height = h + 'px'; s.marginLeft = -w / 2 + 'px'; s.marginTop = -h / 2 + 'px'; }
    apply() {
      const s = this.el.style;
      if (!this.vis || this.op <= 0.004) { s.display = 'none'; return; }
      const d = this.z - cam.z; if (d < 140) { s.display = 'none'; return; }
      const sc = F / d, sx = W / 2 + (this.x - cam.x) * sc, sy = H / 2 + (this.y - cam.y) * sc;
      const half = Math.hypot(this.w, this.h) * this.k * sc * 0.5 + 90;
      if (sx < -half || sx > W + half || sy < -half || sy > H + half) { s.display = 'none'; return; }
      let op = this.op; if (d < 560) op *= smooth(220, 560, d);
      let blur = this.blur; if (this.dof) blur += Math.min(18, (Math.abs(d - cam.focus) / d) * cam.dofK);
      s.display = 'block'; s.opacity = op.toFixed(3); s.zIndex = String(Math.round(50000 - d) + this.zi);
      const tilt = this.ry || this.rx ? ` perspective(2400px) rotateY(${this.ry.toFixed(3)}deg) rotateX(${this.rx.toFixed(3)}deg)` : '';
      s.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)${tilt} rotate(${this.rot.toFixed(3)}deg) scale(${(sc * this.k).toFixed(5)})`;
      s.filter = blur > 0.35 ? `blur(${blur.toFixed(2)}px)` : 'none';
    }
  }

  /** قصاصة من لقطة حقيقية (box بإحداثيات CSS للصورة بعرض 390) */
  function cropEl(name, box, o = {}) {
    const [iw, ih] = SZ[name]; const ch = ih * (390 / iw);
    const el = document.createElement('div'); el.className = 'crop' + (o.cls ? ' ' + o.cls : '');
    el.style.borderRadius = (o.r ?? box.r ?? 0) + 'px';
    const im = img(name); im.style.width = '390px'; im.style.height = ch + 'px'; im.style.left = -box.x + 'px'; im.style.top = -(box.y + (o.offY || 0)) + 'px';
    el.appendChild(im); el._img = im; return el;
  }

  // ───────── النصوص ─────────
  function mkWords(parent, words) {
    const out = [];
    words.forEach(([txt, tm, f], i) => {
      const sp = document.createElement('span'); sp.className = 'wd' + (f && f.hl ? ' hl' : '');
      if (f && f.hl) sp.innerHTML = `<i></i><b>${txt}</b>`; else sp.textContent = txt;
      sp._t = tm; sp._f = f || {}; parent.appendChild(sp);
      if (i < words.length - 1) parent.appendChild(document.createTextNode(' '));
      out.push(sp);
    });
    return out;
  }
  function animWords(spans, t, lightOnDark) {
    for (const sp of spans) {
      const p = seg(t, sp._t - 0.1, sp._t + 0.38), e = eo4(p);
      sp.style.opacity = e.toFixed(3);
      sp.style.transform = `translateY(${((1 - e) * 0.55).toFixed(3)}em) scale(${lerp(0.94, 1, e).toFixed(4)})`;
      sp.style.filter = p > 0 && p < 1 ? `blur(${((1 - e) * 12).toFixed(1)}px)` : 'none';
      if (sp._f.hl) {
        const q = eo4(seg(t, sp._t + 0.1, sp._t + 0.6));
        sp.firstChild.style.transform = `scaleX(${q.toFixed(3)})`;
        sp.lastChild.style.color = q > 0.45 ? '#fff' : lightOnDark ? '#fff' : '';
      }
    }
  }
  function bigText(lines, size, o = {}) {
    const el = document.createElement('div'); el.className = 'big w'; el.style.fontSize = size + 'px';
    if (o.color) el.style.color = o.color; if (o.weight) el.style.fontWeight = o.weight;
    const spans = [];
    for (const ln of lines) { const l = document.createElement('span'); l.className = 'ln'; spans.push(...mkWords(l, ln)); el.appendChild(l); }
    world.appendChild(el);
    const w = Math.ceil(el.offsetWidth) + 10, h = Math.ceil(el.offsetHeight) + 10;
    const maxW = o.maxW ?? 880; const k = w > maxW ? maxW / w : 1;
    const n = new Node(el, w, h, { ...o, k }); n.spans = spans; return n;
  }
  function addStrike(node, a, b) {
    // خط شطب بإيد: SVG بنفس مقاس النص حتى السماكة والتقطيع يضلّوا مزبوطين
    const w = Math.round(node.w * 1.08), d = document.createElement('div'); d.className = 'strike';
    d.innerHTML = `<svg viewBox="0 0 ${w} 80" preserveAspectRatio="none"><path d="M${w - 6},48 C ${(w * 0.74).toFixed(0)},26 ${(w * 0.4).toFixed(0)},60 6,34" stroke="#ef4f4c" stroke-width="15" fill="none" stroke-linecap="round"/></svg>`;
    node.el.appendChild(d); const path = d.querySelector('path'); const len = path.getTotalLength();
    path.setAttribute('stroke-dasharray', `${len} ${len}`); path.setAttribute('stroke-dashoffset', String(len));
    node.strike = { path, a, b, len };
  }
  const caps = [];
  function caption(y, size, a, b, lines, o = {}) {
    const el = document.createElement('div'); el.className = 'cap'; el.style.top = y + 'px'; el.style.fontSize = size + 'px'; if (o.color) el.style.color = o.color;
    const spans = [];
    for (const ln of lines) { const l = document.createElement('span'); l.className = 'ln' + (ln.sm ? ' sm' : ''); if (ln.size) l.style.fontSize = ln.size + 'px'; spans.push(...mkWords(l, ln.w)); el.appendChild(l); }
    (o.parent || hud).appendChild(el);
    // بيوسع بالمنطقة الآمنة: إذا أعرض سطر أكتر من 900px منصغّر الخط كله
    let mw = 0; for (const l of el.children) { l.style.display = 'inline-block'; mw = Math.max(mw, l.offsetWidth); l.style.display = ''; }
    if (mw > 900) { const f = 900 / mw; el.style.fontSize = (size * f).toFixed(1) + 'px'; for (const l of el.children) if (l.style.fontSize) l.style.fontSize = (parseFloat(l.style.fontSize) * f).toFixed(1) + 'px'; }
    const c = { el, spans, a, b, dark: !!o.dark }; caps.push(c); return c;
  }
  function animCaption(c, t) {
    const vis = t > c.a - 0.2 && t < c.b + 0.3; c.el.style.display = vis ? 'block' : 'none'; if (!vis) return;
    animWords(c.spans, t, c.dark);
    const out = eo3(seg(t, c.b, c.b + 0.24));
    c.el.style.opacity = (1 - out).toFixed(3); c.el.style.transform = `translateY(${(-out * 50).toFixed(1)}px)`;
    c.el.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(1)}px)` : 'none';
  }

  // ───────── الخلفية ─────────
  const ORBS = [
    { c: 'rgba(95,224,191,.58)', s: 1150, x: 860, y: 380, ax: 110, ay: 80, sp: 0.19, ph: 0.3 },
    { c: 'rgba(255,216,134,.46)', s: 940, x: 130, y: 1180, ax: 90, ay: 110, sp: 0.15, ph: 2.1 },
    { c: 'rgba(20,149,124,.24)', s: 1250, x: 820, y: 1760, ax: 120, ay: 70, sp: 0.12, ph: 4.0 },
    { c: 'rgba(255,255,255,.9)', s: 700, x: 300, y: 300, ax: 60, ay: 60, sp: 0.22, ph: 1.2 },
  ].map((o) => { const el = document.createElement('div'); el.className = 'orb'; el.style.width = el.style.height = o.s + 'px'; el.style.background = `radial-gradient(closest-side, ${o.c}, rgba(255,255,255,0))`; bg.appendChild(el); return { ...o, el }; });
  function background(t) {
    for (const o of ORBS) {
      const x = o.x + Math.sin(t * o.sp + o.ph) * o.ax - cam.x * 0.035, y = o.y + Math.cos(t * o.sp * 0.8 + o.ph) * o.ay - cam.y * 0.035;
      o.el.style.transform = `translate(${(x - o.s / 2).toFixed(1)}px,${(y - o.s / 2).toFixed(1)}px)`;
    }
  }
  // حبيبات فيلم خفيفة (3 إطارات بتتبدّل)
  const grainC = document.getElementById('grain'), gx = grainC.getContext('2d'); const grains = [];
  for (let k = 0; k < 3; k++) { const r = rng(900 + k); const d = gx.createImageData(540, 960); for (let i = 0; i < d.data.length; i += 4) { const v = 90 + r() * 165; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } grains.push(d); }

  // ───────── بناء المشاهد ─────────
  const S = {};
  const X = { wipeR: 0, iconS: 0, paper: 0, wipeR2: 0 }; // حركات مش تابعة للعناصر (للـ motion blur)
  function build() {
    // محطة السؤال (بعيدة عاليمين حتى ما تتداخل مع الباقي)
    const HX = 3000;
    S.t1 = bigText([[['عندك', 0.02], ['محل؟', 0.52]]], 212, { x: HX, y: -1900 - 130 });
    S.t2 = bigText([[['خلّيني', 1.4], ['قلّك', 1.9], ['شغلة', 2.1]]], 96, { x: HX, y: -1900 + 100, weight: 700, color: '#14957c' });
    S.t3 = bigText([[['لسّا', 2.78], ['عم', 3.22], ['تحسب', 3.38]]], 100, { x: HX, y: -330, weight: 800 });
    S.t4 = bigText([[['عالدفتر', 3.64]]], 190, { x: HX, y: -105 }); addStrike(S.t4, 4.72, 4.98);
    S.t5 = bigText([[['والآلة', 4.14], ['الحاسبة؟', 4.42]]], 150, { x: HX, y: 150 }); addStrike(S.t5, 4.88, 5.14);
    // حسابات «عالإيد» طايرة ورا السؤال
    const r = rng(11);
    S.sums = ['1,800 + 1,200 = ؟', '3,800 × 2', '− 650', '12,500 + 7,250', '= ؟؟', '48 − 1', '9,000 ÷ 3', '+ 2,200'].map((s, i) => {
      const el = document.createElement('div'); el.className = 'big w'; el.style.fontSize = '64px'; el.style.fontWeight = '600'; el.style.color = 'rgba(11,42,36,.20)'; el.style.direction = 'ltr'; el.textContent = s;
      world.appendChild(el); const w = el.offsetWidth + 10, h = el.offsetHeight + 10;
      const n = new Node(el, w, h, { x: HX + (r() - 0.5) * 2100, y: -420 + (r() - 0.5) * 2400, z: 500 + r() * 1300, rot: (r() - 0.5) * 16, dof: true }); n.ph = r() * 6.28; n.k = 1.5 + r(); n.i = i; return n;
    });

    // طبقة اللوغو فوق الأخضر
    S.logoCap = caption(560, 88, 5.4, 6.62, [{ w: [['اسمع', 5.4], ['شو', 5.62], ['بيعمل', 5.74]] }], { parent: wipeFg, color: '#fff', dark: true });
    S.ring = document.createElement('div'); S.ring.style.cssText = 'position:absolute;left:540px;top:980px;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;border:6px solid rgba(255,255,255,.7)'; wipeFg.appendChild(S.ring);
    S.icon = img('icon'); S.icon.style.cssText = 'position:absolute;left:540px;top:980px;width:360px;height:360px;margin:-180px 0 0 -180px;filter:drop-shadow(0 40px 60px rgba(0,40,30,.45))'; wipeFg.appendChild(S.icon);

    // الجوال
    const pel = document.createElement('div'); pel.className = 'phone';
    pel.innerHTML = '<div class="edge"></div><div class="body"></div><div class="screen"></div>';
    const screen = pel.querySelector('.screen');
    S.scr = {};
    for (const n of ['pos0', 'pos1', 'pos2']) { const im = img(n); im.className = 'full'; screen.appendChild(im); S.scr[n] = im; }
    S.tint = document.createElement('div'); S.tint.style.cssText = 'position:absolute;inset:0;background:#0f7a65'; screen.appendChild(S.tint);
    S.gloss = document.createElement('div'); S.gloss.className = 'gloss'; screen.appendChild(S.gloss);
    S.ringT = document.createElement('div'); S.ringT.className = 'ring'; screen.appendChild(S.ringT);
    S.dot = document.createElement('div'); S.dot.className = 'dot'; screen.appendChild(S.dot);
    S.edge = pel.querySelector('.edge');
    S.phone = new Node(pel, 408, 862, { x: 0, y: 300, z: 0, k: 1.72 });

    // شريط السلة ← بطاقة الفاتورة (مورف)
    const bar = BOX.pos2.bar[0], hero = BOX.invoice.hero[0];
    const mel = document.createElement('div'); mel.className = 'crop sh'; mel.style.background = '#0f6e5c';
    S.mBar = cropEl('pos2', bar, { r: 0 }); S.mBar.style.cssText += ';position:absolute;left:0;top:50%;width:366px;height:' + bar.h + 'px;margin-top:' + -bar.h / 2 + 'px';
    S.mHero = cropEl('invoice-tall', hero, { r: 0, offY: 66 }); S.mHero.style.cssText += ';position:absolute;left:0;top:50%;width:366px;height:' + hero.h + 'px;margin-top:' + -hero.h / 2 + 'px';
    mel.appendChild(S.mHero); mel.appendChild(S.mBar);
    S.morph = new Node(mel, 366, bar.h, { z: -40 }); S.barBox = bar; S.heroBox = hero;

    // الإيصال الحراري الحقيقي
    const pw = 290, phh = 360, padX = 70, padT = 70;
    const wrap = document.createElement('div'); wrap.className = 'paperwrap';
    const paper = document.createElement('div'); paper.className = 'paper'; paper.style.cssText = `left:${padX}px;top:${padT}px;width:${pw}px;height:${phh}px`;
    // حافة علوية مسنّنة متل ورق الطابعة
    const teeth = 22; let poly = '';
    for (let i = 0; i <= teeth; i++) poly += `${((i / teeth) * 100).toFixed(2)}% ${i % 2 ? 0 : 1.6}%,`;
    paper.style.clipPath = `polygon(${poly}100% 100%,0% 100%)`;
    const rim = img('receipt'); rim.style.cssText = 'left:12px;top:17px;width:266px;height:330px'; paper.appendChild(rim);
    wrap.appendChild(paper); S.paper = paper;
    S.receipt = new Node(wrap, pw + padX * 2, phh + padT, { z: -20 }); S.paperH = phh; S.paperPadT = padT;

    // محطة المخزون: بطاقتين من نقطة البيع (قبل البيع وبعده)
    const KX = -1250;
    S.tiles = [0, 2].map((idx, i) => {
      const b = BOX.pos0.tile[idx];
      const el = cropEl('pos0', b, { cls: 'sh' });
      // بعد البيع نقطة البيع بترتّب المواد حسب الأكتر مبيعاً: السكر صار بالخانة التانية
      const ab = BOX.pos0.tile[i ? 1 : 0];
      const after = img('paid'); after.style.cssText = `position:absolute;max-width:none;width:390px;height:844px;left:${-ab.x}px;top:${-ab.y}px;opacity:0`; el.appendChild(after);
      const n = new Node(el, b.w, b.h, { x: KX + (i ? -226 : 226), y: 70, z: 0, k: 3.62 }); n.after = after; n.at = i ? 12.3 : 11.92; n.i = i;
      const chip = document.createElement('div'); chip.className = 'chip'; chip.textContent = '−1'; chip.style.fontSize = '54px'; chip.style.lineHeight = '92px';
      n.chip = new Node(chip, 132, 92, { x: n.x - 70, y: n.y + 95, z: -30 }); n.chip.zi = 5;
      return n;
    });

    // محطة التنبيه: بطاقة «نواقص الأصناف» الحقيقية من الرئيسية
    const LX = -2500; const low = BOX.home2.low[0];
    const lel = cropEl('home2-tall', low, { cls: 'sh', offY: 66 });
    S.lowRows = BOX.home2.lowrow.map((rb) => { const d = document.createElement('div'); d.className = 'rowhl'; d.style.cssText = `left:8px;right:8px;top:${rb.y - low.y + 2}px;height:${rb.h - 4}px;opacity:0`; lel.appendChild(d); return d; });
    S.low = new Node(lel, low.w, low.h, { x: LX, y: 70, z: 0, k: 2.36 });
    const bd = document.createElement('div'); bd.className = 'badge'; bd.textContent = '!'; bd.style.fontSize = '92px'; bd.style.lineHeight = '132px';
    S.badge = new Node(bd, 132, 132, { x: LX - (low.w * 2.36) / 2 + 30, y: 70 - (low.h * 2.36) / 2 - 6, z: -30 }); S.badge.zi = 5;
    S.pulses = [0, 1, 2].map(() => { const d = document.createElement('div'); d.className = 'pulse'; return new Node(d, 132, 132, { x: S.badge.x, y: S.badge.y, z: -28 }); });

    // عمق: بطاقات حقيقية مغبّشة ورا، ودوائر ضو قدّام
    const rr = rng(5);
    const props = [
      ['home2-tall', BOX.home2.stat[0]], ['home2-tall', BOX.home2.stat[1]], ['home2-tall', BOX.home2.stat[4]], ['home2-tall', BOX.home2.stat[6]],
      ['cash-tall', BOX.cash.card[0]], ['debts-tall', BOX.debts.stat[0]], ['watch-tall', BOX.watch.stat[2]], ['home2-tall', BOX.home2.dpnet[0]],
    ];
    S.props = [];
    const spots = [[3700, -2650], [2250, -2500], [2150, -1250], [3850, -1150], [2200, 650], [3800, 800], [900, -700], [-800, 900], [-650, -850], [-2000, -900], [-1900, 950], [-3300, 880], [-3400, -800], [700, 950]];
    spots.forEach(([x, y], i) => {
      const [nm, b] = props[i % props.length];
      const el = cropEl(nm, b, { cls: 'sh2', offY: 66 });
      const n = new Node(el, b.w, b.h, { x: x + (rr() - 0.5) * 200, y: y + (rr() - 0.5) * 200, z: 1500 + rr() * 1100, k: 4.2 + rr() * 1.6, rot: (rr() - 0.5) * 14, dof: true });
      n.base = { x: n.x, y: n.y }; n.ph = rr() * 6.28; n.opBase = 0.5; S.props.push(n);
    });
    S.bokeh = [];
    [[1700, -1000], [3900, -450], [2300, 420], [-520, -520], [-760, 620], [-1820, -640], [-1930, 520], [-3050, 300], [600, 700], [-2900, -700]].forEach(([x, y], i) => {
      const el = document.createElement('div'); el.className = 'bokeh'; const c = i % 3 === 0 ? '255,214,130' : i % 3 === 1 ? '95,224,191' : '255,255,255';
      el.style.background = `radial-gradient(closest-side, rgba(${c},.55), rgba(${c},.22) 55%, rgba(${c},0))`;
      const s = 90 + rr() * 100; const n = new Node(el, s, s, { x, y, z: -620 - rr() * 260 }); n.base = { x, y }; n.ph = rr() * 6.28; S.bokeh.push(n);
    });

    // كابشنات
    S.caps = [
      caption(256, 92, 7.08, 9.38, [{ sm: true, size: 62, w: [['بتبيع؟', 7.1]] }, { w: [['الفاتورة', 7.98], ['بتطلع', 8.54], ['بكبستين', 8.86, { hl: 1 }]] }]),
      caption(300, 100, 9.64, 11.1, [{ w: [['وبتنطبع', 9.66], ['فوراً', 10.46, { hl: 1 }]] }]),
      caption(300, 96, 11.38, 12.64, [{ w: [['المخزون', 11.4], ['بينقص', 11.88], ['لحالو', 12.28, { hl: 1 }]] }]),
      caption(262, 92, 12.9, 14.96, [{ w: [['وبينبّهك', 12.92, { hl: 1 }]] }, { w: [['قبل', 13.56], ['ما', 13.78], ['تخلص', 13.94], ['المادة', 14.28]] }]),
      caption(256, 92, 15.22, 17.54, [{ sm: true, size: 62, w: [['الديون؟', 15.24]] }, { w: [['كل', 16.08], ['زبون', 16.44], ['حسابه', 16.8], ['قدّامك', 17.2, { hl: 1 }]] }]),
      caption(300, 96, 17.78, 19.28, [{ w: [['مين', 17.8], ['دفع', 18.02], ['ومين', 18.42], ['لسّا', 18.76, { hl: 1 }]] }]),
      caption(256, 88, 19.52, 21.96, [{ sm: true, size: 62, w: [['والصندوق؟', 19.54]] }, { w: [['بتعرف', 20.34], ['شو', 20.94], ['فات', 21.12], ['وشو', 21.54], ['طلع', 21.7]] }]),
      caption(300, 104, 22.2, 23.72, [{ w: [['ليرة', 22.22], ['بليرة', 22.98, { hl: 1 }]] }]),
      caption(300, 100, 23.96, 25.1, [{ w: [['وآخر', 23.98], ['النهار…', 24.6]] }]),
      caption(256, 88, 25.34, 27.6, [{ sm: true, size: 66, w: [['كبسة', 25.36], ['وحدة', 25.9]] }, { w: [['بتقلّك', 26.16], ['قدّيش', 26.6], ['ربحت', 26.94, { hl: 1 }], ['اليوم', 27.26]] }]),
      caption(300, 92, 27.84, 29.1, [{ w: [['وأي', 27.86], ['مادة', 28.22], ['عم', 28.52], ['تربّحك', 28.64, { hl: 1 }]] }]),
      caption(300, 92, 29.34, 30.8, [{ w: [['وأي', 29.36], ['وحدة', 29.72], ['عم', 30.04], ['تخسّرك', 30.14, { hl: 1 }]] }]),
      caption(256, 96, 37.3, 39.0, [{ sm: true, size: 66, w: [['مع', 37.32], ['خدمة', 37.6]] }, { w: [['الاتصال', 37.98], ['عن', 38.44], ['بعد', 38.6, { hl: 1 }]] }]),
      caption(300, 100, 39.24, 40.58, [{ w: [['بتفتح', 39.26], ['جوالك', 39.94]] }]),
      caption(300, 100, 40.82, 41.86, [{ w: [['وإنت', 40.84], ['بالبيت', 41.26, { hl: 1 }]] }]),
      caption(256, 88, 42.1, 45.02, [{ w: [['وبتشوف', 42.12], ['مبيعات', 42.66], ['محلّك', 43.16]] }, { w: [['لحظة', 43.66], ['بلحظة', 44.36, { hl: 1 }]] }]),
      caption(300, 100, 45.26, 46.36, [{ w: [['بتعمل', 45.28], ['فاتورة', 45.7, { hl: 1 }]] }]),
      caption(300, 100, 46.6, 47.68, [{ w: [['بتراقب', 46.62], ['الصندوق', 47.1, { hl: 1 }]] }]),
      caption(256, 92, 47.92, 50.5, [{ w: [['وبتتابع', 47.94], ['موظفينك', 48.58]] }, { w: [['من', 49.6], ['أي', 49.88], ['مكان', 50.24, { hl: 1 }]] }]),
    ];
    build2();
  }

  // ───────── الكاميرا ─────────
  const MOVES = [
    { t0: 2.48, t1: 3.3, to: { x: 3000, y: 0 }, bump: 200, tx: -5 },
    { t0: 6.0, t1: 6.0, to: { x: 0, y: 0 } },
    { t0: 11.1, t1: 12.02, to: { x: -1250, y: 0 }, bump: 190, ty: 7 },
    { t0: 12.6, t1: 13.44, to: { x: -2500, y: 0 }, bump: 190, ty: 7 },
    { t0: 15.0, t1: 15.84, to: { x: -3750, y: 0 }, bump: 190, ty: 7 },
    { t0: 19.3, t1: 20.14, to: { x: -5000, y: 0 }, bump: 190, ty: 7 },
    { t0: 23.74, t1: 24.58, to: { x: -6250, y: 0 }, bump: 190, ty: 7 },
    { t0: 27.56, t1: 28.38, to: { x: -7500, y: 0 }, bump: 190, ty: 7 },
    { t0: 30.82, t1: 31.64, to: { x: -8750, y: 0 }, bump: 190, ty: 7 },
    { t0: 33.5, t1: 34.3, to: { x: -10000, y: 0 }, bump: 190, ty: 7 },
    { t0: 36.96, t1: 37.8, to: { x: -11250, y: 0 }, bump: 190, ty: 7 },
    { t0: 50.56, t1: 51.4, to: { x: -12500, y: 0 }, bump: 190, ty: 7 },
  ];
  const zDrift = track([[0, -1480], [2.48, -1390], [3.3, -1420], [5.3, -1350], [6.0, -1350], [6.01, -1440], [7.4, -1400, eo3], [11.1, -1356], [12.02, -1400], [12.6, -1385], [13.44, -1405], [15.0, -1350]].concat(MOVES.slice(4).flatMap((m, i, a) => [[m.t1, -1405], [a[i + 1] ? a[i + 1].t0 : 70, -1345]])));
  function camera(t) {
    let pos = { x: 3000, y: -1900 }, bump = 0, ty = 0, tx = 0;
    for (const m of MOVES) {
      if (t >= m.t1) { pos = m.to; continue; }
      if (t > m.t0) { const pl = (t - m.t0) / (m.t1 - m.t0), p = eioS(pl), s = Math.sin(Math.PI * pl); pos = { x: lerp(pos.x, m.to.x, p), y: lerp(pos.y, m.to.y, p) }; bump = (m.bump || 0) * s; ty = (m.ty || 0) * s; tx = (m.tx || 0) * s; }
      break;
    }
    cam.x = pos.x + Math.sin(t * 0.61) * 7; cam.y = pos.y + Math.cos(t * 0.47) * 6; cam.z = zDrift(t) - bump;
    cam.tiltY = ty; cam.tiltX = tx; cam.roll = Math.sin(t * 0.33) * 0.25;
    world.style.transform = `perspective(3200px) rotateY(${cam.tiltY.toFixed(3)}deg) rotateX(${cam.tiltX.toFixed(3)}deg) rotate(${cam.roll.toFixed(3)}deg)`;
  }

  // ───────── المشاهد ─────────
  function hook(t) {
    for (const n of [S.t1, S.t2, S.t3, S.t4, S.t5]) { n.vis = t < 6.0; if (n.vis) animWords(n.spans, t); }
    // خروج السطرين الأولانيين مع نزلة الكاميرا
    const o1 = 1 - smooth(2.5, 3.0, t); S.t1.op = o1; S.t2.op = o1; S.t1.blur = (1 - o1) * 10; S.t2.blur = (1 - o1) * 10;
    for (const n of [S.t4, S.t5]) { const p = eo3(seg(t, n.strike.a, n.strike.b)); n.strike.path.setAttribute('stroke-dashoffset', ((1 - p) * n.strike.len).toFixed(1)); n.strike.path.style.opacity = p > 0 ? 1 : 0; n.el.style.color = p > 0.5 ? 'rgba(11,42,36,.45)' : ''; }
    for (const n of S.sums) { n.vis = t < 6.0; n.op = smooth(2.7 + n.i * 0.07, 3.5 + n.i * 0.07, t) * (1 - smooth(4.9, 5.3, t)); n.y += 0; n.rot += 0; n.el.style.translate = `0 ${(Math.sin(t * 0.5 + n.ph) * 14).toFixed(1)}px`; }
  }
  function logo(t) {
    // دايرة خضرا بتفتح من النص، بعدين الأيقونة بتكبر وبتفتح عالتطبيق
    const R = 1320 * eo3(seg(t, 5.22, 5.78));
    const on = t > 5.2 && t < 7.4; wipe.style.display = on ? 'block' : 'none'; wipeFg.style.display = on ? 'block' : 'none'; X.wipeR = on ? R : 0; X.iconS = 0; if (!on) return;
    const out = smooth(6.84, 7.22, t);
    wipe.style.clipPath = `circle(${R.toFixed(1)}px at 540px 960px)`; wipe.style.opacity = (1 - out).toFixed(3);
    animCaption(S.logoCap, t);
    const k = spring(t - 6.02, 6.5, 9.5), z = ei3(seg(t, 6.62, 7.16));
    S.icon.style.opacity = (seg(t, 6.02, 6.12) * (1 - smooth(6.84, 7.12, t))).toFixed(3);
    S.icon.style.transform = `scale(${(k * (1 + z * 5.2)).toFixed(4)})`; X.iconS = t > 6.02 && t < 7.12 ? k * (1 + z * 5.2) : 0;
    const rp = seg(t, 6.06, 6.9); S.ring.style.opacity = (rp > 0 ? (1 - eo3(rp)) * 0.7 : 0).toFixed(3); S.ring.style.transform = `scale(${(1 + eo3(rp) * 1.7).toFixed(3)})`;
  }
  const P = (bx, by) => ({ x: S.phone.x + (bx - 195) * S.phone.k, y: S.phone.y + (by - 422) * S.phone.k });
  function sale(t) {
    if (t > 30) return;
    const ph = S.phone; ph.vis = t > 6.7 && t < 11.3;
    const inn = eo4(seg(t, 6.8, 7.5)), drop = ei3(seg(t, 8.98, 9.62));
    ph.k = 1.72 * lerp(0.84, 1, inn); ph.op = seg(t, 6.82, 7.06); ph.y = 300 + drop * 2100; ph.blur = drop * 8;
    ph.ry = lerp(-13, 0, eo4(seg(t, 6.8, 7.7))) + Math.sin(t * 0.8) * 1.6; ph.rx = Math.sin(t * 0.6) * 0.8;
    S.edge.style.transform = `translate(${(ph.ry * 0.7).toFixed(2)}px, 2px)`;
    S.gloss.style.backgroundPosition = `${(50 + ph.ry * 9 + t * 3).toFixed(1)}% 0`;
    S.tint.style.opacity = (1 - smooth(6.95, 7.35, t)).toFixed(3);
    // حالات الشاشة الحقيقية: فاضية ← مادة ← مادتين
    S.scr.pos1.style.opacity = seg(t, 7.8, 7.9).toFixed(3); S.scr.pos2.style.opacity = seg(t, 8.22, 8.32).toFixed(3);
    // إصبع اللمس
    const t0 = BOX.pos0.tile[0], t2 = BOX.pos0.tile[2];
    const A = { x: 210, y: 610 }, B = { x: t0.x + t0.w / 2, y: t0.y + t0.h / 2 + 8 }, C = { x: t2.x + t2.w / 2, y: t2.y + t2.h / 2 + 8 };
    let dp;
    if (t < 7.78) { const p = eio(seg(t, 7.4, 7.74)); dp = { x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p) }; } else { const p = eio(seg(t, 7.86, 8.18)); dp = { x: lerp(B.x, C.x, p), y: lerp(B.y, C.y, p) }; }
    const press = Math.max(1 - Math.abs(t - 7.8) / 0.09, 1 - Math.abs(t - 8.22) / 0.09, 0);
    S.dot.style.left = dp.x + 'px'; S.dot.style.top = dp.y + 'px'; S.dot.style.opacity = (seg(t, 7.3, 7.45) * (1 - seg(t, 8.42, 8.6))).toFixed(3); S.dot.style.transform = `scale(${(1 - press * 0.22).toFixed(3)})`;
    const tapT = t >= 8.22 ? 8.22 : 7.8, rp = seg(t, tapT, tapT + 0.45); const rpos = t >= 8.22 ? C : B;
    S.ringT.style.left = rpos.x + 'px'; S.ringT.style.top = rpos.y + 'px'; S.ringT.style.opacity = (t >= 7.8 ? (1 - rp) * 0.9 : 0).toFixed(3); S.ringT.style.transform = `scale(${(1 + eo3(rp) * 1.6).toFixed(3)})`;

    // المورف: شريط السلة الأخضر بيطلع من الجوال وبيصير بطاقة الفاتورة
    const m = S.morph, bar = S.barBox, hero = S.heroBox; m.vis = t >= 8.84 && t < 12.2;
    const p = eioS(seg(t, 8.84, 9.5)), from = P(bar.x + bar.w / 2, bar.y + bar.h / 2);
    m.x = lerp(from.x, 0, p); m.y = lerp(from.y, 372, p); m.k = lerp(1.72, 2.3, p) * (1 + Math.sin(Math.PI * seg(t, 8.84, 9.5)) * 0.03);
    const hh = lerp(bar.h, hero.h, p); m.size(366, hh); m.el.style.borderRadius = lerp(bar.r, hero.r, p).toFixed(1) + 'px';
    S.mBar.style.opacity = (1 - seg(t, 8.9, 9.14)).toFixed(3); S.mHero.style.opacity = seg(t, 8.92, 9.2).toFixed(3);
    m.ry = Math.sin(Math.PI * seg(t, 8.84, 9.6)) * -9 + Math.sin(t * 0.7) * 1.2; m.rx = Math.sin(Math.PI * seg(t, 8.84, 9.6)) * 5;
    m.rot = 0;
  }
  function printing(t) {
    // الإيصال بيطلع من ورا بطاقة الفاتورة لفوق، متل طابعة الكاشير
    const r = S.receipt, k = 1.8; r.vis = t > 9.6 && t < 12.2; r.k = k;
    const slot = 372 - (S.heroBox.h * 2.3) / 2 + 6; // خط الفتحة = أعلى البطاقة
    r.x = 0; r.y = slot - (r.h * k) / 2;
    const pl = seg(t, 9.72, 10.66); let p = eo3(pl); p = lerp(p, Math.floor(p * 16) / 16, 0.3 * (1 - pl));
    S.paper.style.transform = `translateY(${((1 - p) * (S.paperH + 30)).toFixed(1)}px) rotate(${(Math.sin(t * 2.2) * 0.35 * p).toFixed(3)}deg)`; X.paper = r.vis ? (1 - p) * (S.paperH + 30) : 0;
    // كبسة خفيفة للبطاقة وقت الطباعة
    if (t > 9.6 && t < 10.7) S.morph.k *= 1 - Math.sin(Math.PI * seg(t, 9.66, 9.9)) * 0.022;
  }
  function stock(t) {
    for (const n of S.tiles) {
      const a = 11.5 + n.i * 0.13; n.vis = t > a - 0.05;
      const e = spring(t - a, 6.5, 8.5), f = seg(t, n.at, n.at + 0.13), bumpK = 1 + Math.sin(Math.PI * seg(t, n.at - 0.02, n.at + 0.34)) * 0.07;
      n.k = 3.62 * lerp(0.82, 1, e) * bumpK; n.op = seg(t, a, a + 0.18); n.y = 70 + (1 - eo4(seg(t, a, a + 0.6))) * 130;
      n.ry = (n.i ? 7 : -7) * (1 - eo3(seg(t, a, a + 0.9))) + Math.sin(t * 0.9 + n.i) * 1.3; n.rx = Math.sin(t * 0.7 + n.i * 2) * 0.9;
      n.after.style.opacity = f.toFixed(3);
      const c = n.chip, cp = seg(t, n.at, n.at + 1.0); c.vis = cp > 0 && cp < 1;
      c.k = spring((t - n.at) * 1.2, 7, 11); c.y = n.y + (n.h * 3.62) / 2 - 6 - eo3(cp) * 70; c.x = n.x - (n.w * 3.62) / 2 + 26; c.op = 1 - smooth(0.7, 1, cp);
    }
  }
  function lowStock(t) {
    const n = S.low, a = 13.0; n.vis = t > 12.5;
    const e = spring(t - a, 6.5, 8); n.k = 2.36 * lerp(0.86, 1, e); n.op = seg(t, a - 0.05, a + 0.2); n.y = 70 + (1 - eo4(seg(t, a, a + 0.7))) * 110;
    n.ry = -6 * (1 - eo3(seg(t, a, a + 1.0))) + Math.sin(t * 0.8) * 1.2; n.rx = Math.sin(t * 0.6) * 0.8;
    [13.56, 13.94, 14.28].forEach((tt, i) => { S.lowRows[i].style.opacity = (eo3(seg(t, tt, tt + 0.25))).toFixed(3); });
    const b = S.badge, ba = 13.18; b.vis = t > ba; b.k = spring(t - ba, 6, 12); b.y = n.y - (n.h * n.k) / 2 - 4; b.x = n.x - (n.w * n.k) / 2 + 34; b.rot = Math.sin((t - ba) * 9) * 9 * Math.exp(-(t - ba) * 2.2);
    S.pulses.forEach((pn, i) => { const pt = ((t - ba - i * 0.42) % 1.26 + 1.26) % 1.26, pp = pt / 1.26; pn.vis = t > ba + 0.1 + i * 0.42; pn.x = b.x; pn.y = b.y; pn.k = 1 + eo3(pp) * 1.5; pn.op = (1 - pp) * 0.75; });
  }
  function depth(t) {
    for (const n of S.props2 || []) { n.x = n.base.x + Math.sin(t * 0.21 + n.ph) * 40; n.y = n.base.y + Math.cos(t * 0.17 + n.ph) * 46; n.op = 0.5; }
    for (const n of S.props) { n.x = n.base.x + Math.sin(t * 0.21 + n.ph) * 40; n.y = n.base.y + Math.cos(t * 0.17 + n.ph) * 46; n.op = n.opBase; }
    for (const n of S.bokeh) { n.x = n.base.x + Math.sin(t * 0.3 + n.ph) * 30; n.y = n.base.y + Math.cos(t * 0.26 + n.ph) * 34; n.op = 0.9; }
  }


  // ═════════ الجزء التاني (15.2 → 68.8) ═════════
  const st = document.createElement('style');
  st.textContent = `.tagp{direction:rtl;font-weight:800;color:#fff;border-radius:999px;text-align:center;white-space:nowrap}
  .tagg{background:linear-gradient(135deg,#17a587,#0f7a65);box-shadow:0 14px 26px -10px rgba(15,110,92,.6)}
  .tagr{background:linear-gradient(135deg,#f0524f,#d92d2a);box-shadow:0 14px 26px -10px rgba(217,45,42,.6)}
  .ck{direction:rtl;white-space:nowrap;font-weight:800;color:#0b2a24;display:flex;align-items:center;gap:26px;justify-content:center}
  .ck i{display:inline-block;width:86px;height:86px;border-radius:50%;background:linear-gradient(135deg,#17a587,#0f7a65);position:relative;box-shadow:0 14px 26px -10px rgba(15,110,92,.6)}
  .ck svg{position:absolute;inset:0}
  .lay{position:absolute;left:0;top:0;width:1080px;height:1920px}
  .wt{position:absolute;left:0;width:1080px;text-align:center;direction:rtl;color:#fff;font-weight:900;white-space:nowrap;letter-spacing:-0.01em}
  .wpill{display:inline-block;background:#fff;color:#0f6e5c;border-radius:999px;padding:.18em .7em;box-shadow:0 24px 44px -16px rgba(0,30,22,.5)}`;
  document.head.appendChild(st);
  function hero(name, box, x, y, k, o = {}) { const el = cropEl(name, box, { cls: 'sh', offY: o.offY ?? 66 }); const n = new Node(el, box.w, box.h, { x, y, z: o.z || 0, k, rot: o.rot || 0 }); n.k0 = k; n.y0 = y; n.r0 = o.rot || 0; n.vis = false; return n; }
  function popIn(n, t, a, o = {}) {
    n.vis = t > a - 0.05; if (!n.vis) return;
    const e = spring(t - a, 6.5, 8.5); n.k = n.k0 * lerp(0.84, 1, e); n.op = seg(t, a, a + 0.18); n.y = n.y0 + (1 - eo4(seg(t, a, a + 0.6))) * (o.rise ?? 120);
    n.ry = (o.ry ?? -6) * (1 - eo3(seg(t, a, a + 0.9))) + Math.sin(t * 0.8 + (o.ph || 0)) * 1.2; n.rx = Math.sin(t * 0.6 + (o.ph || 0)) * 0.8; n.rot = n.r0;
  }
  function tag(text, cls, x, y, size = 50) {
    const el = document.createElement('div'); el.className = 'tagp ' + cls + ' w'; el.textContent = text; el.style.fontSize = size + 'px'; el.style.lineHeight = size * 1.75 + 'px'; el.style.padding = `0 ${size * 0.6}px`;
    world.appendChild(el); const w = el.offsetWidth + 2, h = el.offsetHeight; el.style.padding = '0';
    const n = new Node(el, w, h, { x, y, z: -30 }); n.zi = 6; n.vis = false; n.y0 = y; return n;
  }
  function tagIn(n, t, a) { n.vis = t > a; if (!n.vis) return; n.k = spring(t - a, 6.5, 11); n.rot = Math.sin((t - a) * 8) * 5 * Math.exp(-(t - a) * 2.4) - 3; n.y = n.y0 + Math.sin(t * 1.1) * 3; }
  function ringNode(x, y) { const d = document.createElement('div'); d.className = 'pulse'; d.style.borderColor = 'rgba(23,165,135,.85)'; const n = new Node(d, 120, 120, { x, y, z: -32 }); n.vis = false; return n; }
  function build2() {
    const B = BOX;
    // الديون
    const DX = -3750;
    S.dStat = hero('debts-tall', B.debts.stat[0], DX, -205, 2.5);
    S.dRow = [hero('debts-tall', B.debts.row[0], DX + 105, 255, 1.46, { rot: 3 }), hero('debts-tall', B.debts.row[1], DX - 105, 345, 1.46, { rot: -3.5, z: -10 })];
    S.dTag = [tag('دفع ✓', 'tagg', DX + 270, 20), tag('لسّا', 'tagr', DX - 300, 110)];
    // الصندوق
    const CX = -5000;
    S.cCard = hero('cash-tall', B.cash.card[0], CX, -150, 2.35);
    S.cIn = hero('cash-tall', B.cash.stat[1], CX + 222, 150, 2.3); S.cOut = hero('cash-tall', B.cash.stat[2], CX - 222, 150, 2.3);
    S.cRow = [hero('cash-tall', B.cash.row[1], CX + 70, 470, 1.6, { rot: 2 }), hero('cash-tall', B.cash.row[2], CX - 70, 640, 1.6, { rot: -2.5, z: -10 })];
    // الربح
    const PX = -6250;
    S.pNet = hero('home2-tall', B.home2.dpnet[0], PX, -70, 2.6); S.pKv = hero('home2-tall', { ...B.home2.dpkv[0], r: 16 }, PX, 410, 2.3);
    S.pRing = ringNode(PX, -70);
    const QX = -7500;
    S.wRow = hero('watch-tall', B.watch.row[0], QX, -40, 1.78); S.wLose = hero('watch-tall', B.watch.stat[3], QX, 470, 2.6);
    S.wTag = [tag('عم تربّحك', 'tagg', QX - 180, -265), tag('ولا وحدة ✓', 'tagg', QX - 150, 330)];
    // بدون إنترنت
    const OX = -8750;
    S.o1 = bigText([[['وكل', 31.06], ['هاد…', 31.5]]], 110, { x: OX, y: -330, weight: 800 });
    S.o2 = bigText([[['بدون', 32.0], ['إنترنت', 32.48, { hl: 1 }]]], 180, { x: OX, y: -100 });
    const wf = document.createElement('div');
    wf.innerHTML = `<svg viewBox="0 0 300 300" width="300" height="300" fill="none" stroke="#0b2a24" stroke-width="22" stroke-linecap="round"><path d="M40,120 A150,150 0 0 1 260,120"/><path d="M82,168 A92,92 0 0 1 218,168"/><circle cx="150" cy="222" r="14" fill="#0b2a24" stroke="none"/><path class="sl" d="M52,262 L248,40" stroke="#ef4f4c" stroke-width="24"/></svg>`;
    S.wifi = new Node(wf, 300, 300, { x: OX, y: 260 }); S.wifi.sl = wf.querySelector('.sl'); S.wifi.len = S.wifi.sl.getTotalLength(); S.wifi.sl.setAttribute('stroke-dasharray', S.wifi.len + ' ' + S.wifi.len);
    // السؤال
    const RX0 = -10000;
    S.q1 = bigText([[['طيب', 33.76], ['وإذا', 34.26], ['إنت', 34.48]]], 120, { x: RX0, y: -250, weight: 800 });
    S.q2 = bigText([[['مش', 34.68], ['بالمحل؟', 34.82]]], 180, { x: RX0, y: -20 });
    S.q3 = bigText([[['هون', 35.9], ['الحلو', 36.4, { hl: 1 }]]], 150, { x: RX0, y: 290 });
    // عن بعد
    const RX = -11250; S.RX = RX;
    S.pillA = tag('المحل', 'tagg', RX + 280, 30, 70); S.pillB = tag('البيت', 'tagg', RX - 280, 30, 70);
    const ln = document.createElement('div'); ln.innerHTML = `<svg viewBox="0 0 420 200" width="420" height="200" fill="none"><path d="M410,150 C 320,10 100,10 10,150" stroke="#14957c" stroke-width="9" stroke-linecap="round" stroke-dasharray="4 22"/></svg>`;
    S.link = new Node(ln, 420, 200, { x: RX, y: -70 }); S.link.el.style.overflow = 'hidden';
    const scr = S.tint.parentNode; S.rs = {};
    for (const n of ['home2', 'pos2', 'cash', 'invoices']) { const im = img(n); im.className = 'full'; im.style.opacity = 0; scr.insertBefore(im, S.tint); S.rs[n] = im; }
    S.rStat = hero('home2-tall', B.home2.stat[0], RX, 120, 3.3, { z: -40 });
    S.live = tag('● مباشر', 'tagr', RX - 190, -95, 44);
    // التنصيب
    const SX = -12500;
    S.s1 = bigText([[['والتنصيب', 50.86], ['والشرح؟', 51.72]]], 112, { x: SX, y: -330, weight: 800 });
    S.s2 = bigText([[['علينا', 52.64, { hl: 1 }]]], 230, { x: SX, y: -90 });
    S.cks = [['منركّبلك ياه', 53.5], ['منعلّمك عليه', 54.6], ['ومنضل معك', 55.8]].map(([tx, at], i) => {
      const el = document.createElement('div'); el.className = 'ck w'; el.style.fontSize = '80px';
      el.innerHTML = `<i><svg viewBox="0 0 86 86"><path d="M25,45 L38,58 L62,31" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60 60" stroke-dashoffset="60"/></svg></i><span>${tx}</span>`;
      world.appendChild(el); const n = new Node(el, el.offsetWidth + 4, el.offsetHeight + 4, { x: SX, y: 190 + i * 150 }); n.at = at; n.path = el.querySelector('path'); n.y0 = n.y; return n;
    });
    // عمق إضافي للمحطات الجديدة
    const rr = rng(77); const pr = [['home2-tall', B.home2.stat[0]], ['home2-tall', B.home2.stat[1]], ['cash-tall', B.cash.card[0]], ['debts-tall', B.debts.stat[0]], ['watch-tall', B.watch.stat[2]], ['home2-tall', B.home2.dpnet[0]]];
    S.props2 = [];
    for (let i = 0; i < 26; i++) { const [nm, b] = pr[i % pr.length]; const el = cropEl(nm, b, { cls: 'sh2', offY: 66 }); const n = new Node(el, b.w, b.h, { x: -3900 - i * 400 + (rr() - 0.5) * 240, y: (i % 2 ? 1 : -1) * (760 + rr() * 320), z: 1500 + rr() * 1100, k: 4.2 + rr() * 1.6, rot: (rr() - 0.5) * 14, dof: true }); n.base = { x: n.x, y: n.y }; n.ph = rr() * 6.28; S.props2.push(n); }
    // العرض والخاتمة (فوق أخضر)
    const stage = document.getElementById('stage');
    S.w2 = document.createElement('div'); S.w2.className = 'lay'; S.w2.style.cssText += ';background:radial-gradient(120% 90% at 30% 18%, #1fb393 0%, #12806a 42%, #0b5b4b 100%);display:none';
    S.f2 = document.createElement('div'); S.f2.className = 'lay'; S.f2.style.display = 'none';
    stage.insertBefore(S.w2, hud); stage.insertBefore(S.f2, hud);
    const wt = (y, size, html, extra = '') => { const d = document.createElement('div'); d.className = 'wt'; d.style.cssText += `;top:${y}px;font-size:${size}px;${extra}`; d.innerHTML = html; S.f2.appendChild(d); return d; };
    S.of1 = caption(455, 88, 57.18, 61.9, [{ w: [['وهلّق', 57.2], ['في', 57.9], ['عرض', 58.06]] }], { parent: S.f2, color: '#fff', dark: true });
    S.of2 = wt(610, 130, 'خصم');
    S.of3 = wt(770, 450, '<span style="direction:ltr;display:inline-block"><span id="pctn">0</span>%</span>', 'line-height:1.1;color:#eafff7;text-shadow:0 40px 70px rgba(0,40,30,.35)');
    S.pctn = S.of3.querySelector('#pctn');
    S.of4 = wt(1330, 76, '<span class="wpill">لفترة محدودة</span>', 'font-weight:800');
    S.eIcon = img('icon'); S.eIcon.style.cssText = 'position:absolute;left:540px;top:640px;width:330px;height:330px;margin:-165px 0 0 -165px;filter:drop-shadow(0 40px 60px rgba(0,40,30,.45))'; S.f2.appendChild(S.eIcon);
    S.e1 = caption(880, 92, 63.14, 99, [{ w: [['محلّك', 63.16], ['كله', 63.92], ['بجيبتك', 64.22]] }], { parent: S.f2, color: '#fff', dark: true });
    S.e2 = wt(1075, 84, '<span class="wpill" style="direction:ltr">waznsy.com</span>', 'font-weight:800');
    S.e3 = wt(1290, 54, 'واتساب', 'font-weight:700;color:#c9f5e8');
    S.e4 = wt(1370, 66, '<span style="direction:ltr;display:inline-block">0968 037 609 &nbsp;·&nbsp; 0980 072 891</span>', 'font-weight:800');
  }
  const fadeUp = (el, t, a, d = 0.5, dy = 60) => { const e = eo4(seg(t, a, a + d)); el.style.opacity = e.toFixed(3); el.style.transform = `translateY(${((1 - e) * dy).toFixed(1)}px) scale(${lerp(0.94, 1, e).toFixed(4)})`; el.style.filter = e < 1 && e > 0 ? `blur(${((1 - e) * 10).toFixed(1)}px)` : 'none'; return e; };
  function part2(t) {
    if (t < 14.5) { for (const n of [S.dStat, ...S.dRow, ...S.dTag, S.cCard, S.cIn, S.cOut, ...S.cRow, S.pNet, S.pKv, S.pRing, S.wRow, S.wLose, ...S.wTag, S.o1, S.o2, S.wifi, S.q1, S.q2, S.q3, S.pillA, S.pillB, S.link, S.rStat, S.live, S.s1, S.s2, ...S.cks]) n.vis = false; S.w2.style.display = 'none'; S.f2.style.display = 'none'; X.wipeR2 = 0; return; }
    // الديون
    popIn(S.dStat, t, 15.5); popIn(S.dRow[0], t, 16.1, { ry: 6, ph: 1 }); popIn(S.dRow[1], t, 16.5, { ry: -6, ph: 2 });
    tagIn(S.dTag[0], t, 18.02); tagIn(S.dTag[1], t, 18.76);
    // الصندوق
    popIn(S.cCard, t, 19.86); popIn(S.cIn, t, 20.94, { ry: 5, ph: 1 }); popIn(S.cOut, t, 21.56, { ry: -5, ph: 2 }); popIn(S.cRow[0], t, 22.22, { ph: 3 }); popIn(S.cRow[1], t, 22.86, { ph: 4 });
    // الربح
    popIn(S.pNet, t, 24.5); S.pNet.k *= 1 + Math.sin(Math.PI * seg(t, 25.38, 25.8)) * 0.06; popIn(S.pKv, t, 26.5, { ph: 2 });
    const rp = seg(t, 25.36, 26.0); S.pRing.vis = rp > 0 && rp < 1; S.pRing.k = 1 + eo3(rp) * 3.2; S.pRing.op = (1 - rp) * 0.8;
    popIn(S.wRow, t, 28.22); tagIn(S.wTag[0], t, 28.7); popIn(S.wLose, t, 29.5, { ph: 2 }); tagIn(S.wTag[1], t, 30.2);
    // بدون إنترنت
    for (const n of [S.o1, S.o2]) { n.vis = t > 30.5 && t < 36; if (n.vis) animWords(n.spans, t); }
    S.wifi.vis = t > 31.9 && t < 36; S.wifi.k = spring(t - 31.95, 6.5, 9); S.wifi.sl.setAttribute('stroke-dashoffset', ((1 - eo3(seg(t, 32.45, 32.8))) * S.wifi.len).toFixed(1));
    // السؤال
    for (const n of [S.q1, S.q2, S.q3]) { n.vis = t > 33 && t < 39.5; if (n.vis) animWords(n.spans, t); }
    // عن بعد
    const RX = S.RX; const po = 1 - smooth(39.0, 39.35, t);
    S.pillA.vis = t > 37.9 && t < 39.4; S.pillB.vis = t > 38.5 && t < 39.4; S.pillA.k = spring(t - 37.92, 6.5, 10); S.pillB.k = spring(t - 38.56, 6.5, 10); S.pillA.op = po; S.pillB.op = po; S.pillA.rot = 0; S.pillB.rot = 0;
    S.link.vis = t > 38.0 && t < 39.4; S.link.op = po; S.link.el.style.clipPath = `inset(0 0 0 ${((1 - eo3(seg(t, 38.05, 38.6))) * 100).toFixed(1)}%)`;
    if (t > 30) {
      const ph = S.phone; ph.vis = t > 39.1 && t < 51.6; const inn = eo4(seg(t, 39.2, 40.0));
      ph.x = RX; ph.k = 1.72; ph.op = seg(t, 39.2, 39.4); ph.y = 300 + (1 - inn) * 1500; ph.blur = 0;
      ph.ry = lerp(12, 0, eo4(seg(t, 39.2, 40.3))) + Math.sin(t * 0.8) * 1.6; ph.rx = Math.sin(t * 0.6) * 0.8;
      S.edge.style.transform = `translate(${(ph.ry * 0.7).toFixed(2)}px, 2px)`; S.gloss.style.backgroundPosition = `${(50 + ph.ry * 9 + t * 3).toFixed(1)}% 0`;
      S.tint.style.opacity = 0; S.dot.style.opacity = 0; S.ringT.style.opacity = 0;
      const order = [['home2', 0], ['pos2', 45.26], ['cash', 46.6], ['invoices', 47.92]];
      order.forEach(([n, a], i) => { const p = i ? eioS(seg(t, a, a + 0.42)) : 1; S.rs[n].style.opacity = i ? (p > 0 ? 1 : 0) : 1; S.rs[n].style.transform = `translateX(${((p - 1) * 100).toFixed(2)}%)`; });
    } else for (const n of Object.values(S.rs)) n.style.opacity = 0;
    // بطاقة «مبيعات اليوم» بتطلع من الجوال
    const sb = BOX.home2.stat[0]; const from = { x: RX + (sb.x + sb.w / 2 - 195) * 1.72, y: 300 + (sb.y + 66 + sb.h / 2 - 422) * 1.72 };
    const sp = eioS(seg(t, 42.5, 43.2)), back = eioS(seg(t, 44.8, 45.3)); const q = sp * (1 - back);
    S.rStat.vis = t > 42.5 && t < 45.3; S.rStat.x = lerp(from.x, RX, q); S.rStat.y = lerp(from.y, 110, q); S.rStat.k = lerp(1.72, 3.3, q); S.rStat.ry = Math.sin(Math.PI * sp) * -8 + Math.sin(t * 0.8) * 1.2; S.rStat.rx = Math.sin(t * 0.6); S.rStat.op = 1;
    S.live.vis = t > 43.5 && t < 44.8; S.live.k = spring(t - 43.52, 6.5, 11); S.live.op = 0.65 + 0.35 * Math.sin(t * 9); S.live.rot = -3;
    // التنصيب
    for (const n of [S.s1, S.s2]) { n.vis = t > 50 && t < 58; if (n.vis) animWords(n.spans, t); }
    for (const n of S.cks) { n.vis = t > n.at - 0.05 && t < 58; const e = eo4(seg(t, n.at, n.at + 0.5)); n.op = e; n.y = n.y0 + (1 - e) * 60; n.blur = (1 - e) * 8; n.path.setAttribute('stroke-dashoffset', ((1 - eo3(seg(t, n.at + 0.2, n.at + 0.55))) * 60).toFixed(1)); }
    // العرض + الخاتمة
    const on = t > 56.9; S.w2.style.display = on ? 'block' : 'none'; S.f2.style.display = on ? 'block' : 'none'; X.wipeR2 = 0; if (!on) return;
    const R = 1320 * eo3(seg(t, 57.0, 57.56)); X.wipeR2 = R; S.w2.style.clipPath = `circle(${R.toFixed(1)}px at 540px 960px)`;
    const out = smooth(61.86, 62.2, t), oo = (el) => { el.style.opacity = (parseFloat(el.style.opacity) * (1 - out)).toFixed(3); if (out > 0) el.style.transform += ` translateY(${(-out * 70).toFixed(1)}px)`; };
    animCaption(S.of1, t);
    fadeUp(S.of2, t, 58.5); oo(S.of2);
    const pe = spring(t - 59.2, 5.5, 8.5); S.of3.style.opacity = seg(t, 59.2, 59.36).toFixed(3); S.of3.style.transform = `scale(${lerp(0.6, 1, pe).toFixed(4)})`; S.pctn.textContent = String(Math.round(25 * eo3(seg(t, 59.22, 60.0)))); oo(S.of3);
    fadeUp(S.of4, t, 60.76); oo(S.of4);
    const ik = spring(t - 62.2, 6.5, 9.5); S.eIcon.style.opacity = seg(t, 62.2, 62.32).toFixed(3); S.eIcon.style.transform = `scale(${ik.toFixed(4)}) rotate(${(Math.sin(t * 0.9) * 1.5).toFixed(2)}deg)`;
    animCaption(S.e1, t); fadeUp(S.e2, t, 65.86); fadeUp(S.e3, t, 67.44); fadeUp(S.e4, t, 67.66);
  }

  function state(t) {
    camera(t); background(t); depth(t); hook(t); logo(t); sale(t); printing(t); stock(t); lowStock(t); part2(t);
    for (const c of S.caps) animCaption(c, t);
  }
  window.render = (t) => {
    state(t);
    for (const n of nodes) n.apply();
    gx.putImageData(grains[Math.floor(t * 30) % 3], 0, 0);
    fadeEl.style.opacity = (smooth(window.DURATION - 0.45, window.DURATION - 0.05, t)).toFixed(3);
  };
  /** أقصى حركة عالشاشة (px) بين t و t+dt: الرندر بيستعملها ليقرر كم فريم فرعي يدمج (motion blur بس وقت الحركة السريعة) */
  function snap() {
    const out = new Map();
    for (const n of nodes) {
      if (!n.vis || n.op < 0.05) continue; const d = n.z - cam.z; if (d < 140) continue;
      const sc = F / d, sx = W / 2 + (n.x - cam.x) * sc, sy = H / 2 + (n.y - cam.y) * sc, size = Math.max(n.w, n.h) * n.k * sc;
      if (sx < -size || sx > W + size || sy < -size || sy > H + size) continue;
      out.set(n, [sx, sy, size, n.rot + n.ry * 0.6]);
    }
    return { m: out, x: { ...X } };
  }
  window.motion = (t, dt) => {
    state(t); const a = snap(); state(t + dt); const b = snap(); let mx = 0;
    for (const [n, p] of a.m) { const q = b.m.get(n); if (!q) continue; const d = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) + Math.abs(q[2] - p[2]) * 0.5 + Math.abs(q[3] - p[3]) * p[2] * 0.009; if (d > mx) mx = d; }
    mx = Math.max(mx, Math.abs(b.x.wipeR - a.x.wipeR) * 0.8, Math.abs(b.x.wipeR2 - a.x.wipeR2) * 0.8, Math.abs(b.x.iconS - a.x.iconS) * 180, Math.abs(b.x.paper - a.x.paper) * 1.8);
    return mx;
  };

  (async () => {
    await Promise.all([900, 800, 700, 600].map((w) => document.fonts.load(`${w} 100px Alexandria`, 'عندك محل 25% waznsy')));
    await document.fonts.ready;
    build();
    await Promise.all(pending);
    window.render(0);
    window.READY = true;
  })();
})();
