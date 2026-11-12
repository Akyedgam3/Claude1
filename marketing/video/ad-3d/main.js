import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const W = 1080, H = 1920;
const C = { bg: 0x031109, green: 0x14957c, mint: 0x5fe0bf, gold: 0xe7b75a, gold2: 0xffe29a, red: 0xff3b3b };
window.DURATION = 68.8;

// ───────── أدوات ─────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = (x) => 1 - Math.pow(1 - x, 3);
const eo5 = (x) => 1 - Math.pow(1 - x, 5);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.FogExp2(C.bg, 0.028);
const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);

scene.add(new THREE.AmbientLight(0x9fd8c8, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 9, 8); scene.add(key);
const rim = new THREE.PointLight(C.mint, 60, 40); rim.position.set(-6, 4, -4); scene.add(rim);
const warm = new THREE.PointLight(C.gold, 50, 40); warm.position.set(7, 3, 2); scene.add(warm);

// أرض عاكسة
const floor = new Reflector(new THREE.PlaneGeometry(120, 120), { textureWidth: 1024, textureHeight: 1024, color: 0x0a2a22, clipBias: 0.003 });
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.2; scene.add(floor);
const floorTint = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: C.bg, transparent: true, opacity: 0.72 }));
floorTint.rotation.x = -Math.PI / 2; floorTint.position.y = -3.19; scene.add(floorTint);

// ───────── نص على لوح ─────────
function textTex(lines, o = {}) {
  const size = o.size ?? 200, pad = size * 0.5, lh = size * 1.25;
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  const font = `${o.weight ?? 900} ${size}px Cairo`;
  x.font = font; x.direction = 'rtl';
  const widths = lines.map((l) => x.measureText(l).width);
  c.width = Math.ceil(Math.max(...widths) + pad * 2); c.height = Math.ceil(lh * lines.length + pad * 1.4);
  x.font = font; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const cy = pad * 0.7 + lh * (i + 0.5);
    let fill = o.color ?? '#ffffff';
    if (o.gold) { const g = x.createLinearGradient(0, cy - size * 0.6, 0, cy + size * 0.6); g.addColorStop(0, '#fff3c4'); g.addColorStop(0.45, '#ffd978'); g.addColorStop(1, '#c98a2b'); fill = g; }
    if (o.mint) { const g = x.createLinearGradient(0, cy - size * 0.6, 0, cy + size * 0.6); g.addColorStop(0, '#d9fff3'); g.addColorStop(1, '#3fd0aa'); fill = g; }
    if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = size * 0.35; }
    x.fillStyle = fill; x.fillText(l, c.width / 2, cy);
    x.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { t, aspect: c.width / c.height };
}
function textMesh(lines, height, o = {}) {
  const { t, aspect } = textTex(Array.isArray(lines) ? lines : [lines], o);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
  m.userData.w = height * aspect; m.userData.h = height; m.renderOrder = 10;
  return m;
}
/** نص بسماكة (طبقات متراكبة) للحظات الـ3D */
function thickText(lines, height, o = {}) {
  const g = new THREE.Group();
  const { t, aspect } = textTex(Array.isArray(lines) ? lines : [lines], o);
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const N = o.layers ?? 26;
  for (let i = N; i >= 0; i--) {
    const k = i / N;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, fog: false, toneMapped: false, color: i === 0 ? 0xffffff : new THREE.Color().setRGB(0.55 - 0.4 * k, 0.33 - 0.25 * k, 0.08) });
    const m = new THREE.Mesh(geo, mat); m.position.z = -k * (o.depth ?? 0.9); g.add(m);
  }
  g.userData.w = height * aspect; g.userData.h = height;
  return g;
}

// ───────── إيصالات الفوضى ─────────
function receiptTex(i) {
  const r = rng(100 + i * 7);
  const c = document.createElement('canvas'); c.width = 300; c.height = 520; const x = c.getContext('2d');
  x.fillStyle = ['#f4efe2', '#efe7d3', '#f8f5ec'][i % 3]; x.fillRect(0, 0, 300, 520);
  x.fillStyle = '#2b2b2b'; x.font = '700 30px Cairo'; x.textAlign = 'center'; x.direction = 'rtl';
  x.fillText(['فاتورة', 'دين', 'حساب', 'وصل'][i % 4], 150, 50);
  x.strokeStyle = '#8a8a8a'; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(20, 72); x.lineTo(280, 72); x.stroke(); x.setLineDash([]);
  for (let k = 0; k < 8; k++) {
    const y = 110 + k * 44;
    x.fillStyle = '#9a9488'; x.fillRect(150 + r() * 30, y - 12, 110 - r() * 40, 12);
    const red = r() < 0.45;
    x.fillStyle = red ? '#d21f1f' : '#2b2b2b'; x.font = '700 26px Cairo'; x.textAlign = 'left';
    x.fillText((red ? '−' : '') + (Math.floor(r() * 90) * 500 + 500).toLocaleString('en'), 24, y);
  }
  x.strokeStyle = '#d21f1f'; x.lineWidth = 5; x.beginPath(); x.ellipse(90, 470, 70, 26, -0.1, 0, 6.3); x.stroke();
  x.fillStyle = '#d21f1f'; x.font = '900 30px Cairo'; x.textAlign = 'center'; x.fillText('؟؟', 90, 481);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const receipts = new THREE.Group(); scene.add(receipts);
const RC = 150; const rc = [];
function buildReceipts() {
  const texs = [0, 1, 2, 3, 4, 5].map(receiptTex);
  const r = rng(42);
  const geo = new THREE.PlaneGeometry(0.75, 1.3, 6, 1);
  // انحناءة ورقة خفيفة
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.75) * 3.1) * 0.06);
  geo.computeVertexNormals();
  for (let i = 0; i < RC; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texs[i % 6], side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
    const d = { a: r() * 6.283, rad: 2.2 + r() * 7.5, y: -2.6 + r() * 9, sp: 0.25 + r() * 0.5, tw: r() * 6.283, tws: 0.6 + r() * 1.6, s: 0.7 + r() * 0.9, ph: r() };
    rc.push({ m, d }); receipts.add(m);
  }
}
const redNums = new THREE.Group(); scene.add(redNums); const rn = [];
function buildRedNums() {
  const r = rng(7);
  ['−125,000', '؟', '−48,500', 'ناقص!', '−9,750', 'دين؟', '−310,000', '؟؟'].forEach((s, i) => {
    const m = textMesh(s, 0.55 + r() * 0.5, { color: '#ff4a4a', glow: '#ff0000', size: 150 });
    const d = { a: r() * 6.283, rad: 2.6 + r() * 4, y: -1.5 + r() * 6, sp: 0.15 + r() * 0.25 };
    rn.push({ m, d }); redNums.add(m);
  });
}

// ───────── لوحات شاشات البرنامج ─────────
const loader = new THREE.TextureLoader();
function roundedShape(w, h, r) { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function panel(tex, w, h) {
  const g = new THREE.Group();
  const shape = roundedShape(w, h, 0.16);
  const geo = new THREE.ShapeGeometry(shape, 12);
  // UV من الإحداثيات
  const p = geo.attributes.position; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(w + 0.14, h + 0.14, 0.2), { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: 0x0b1f1a, roughness: 0.25, metalness: 0.9 }));
  body.position.z = -0.17; g.add(body);
  const scr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xc8c8c8 })); g.add(scr);
  // هالة حواف
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(w + 0.5, h + 0.5, 0.4), 12), new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0.16, depthWrite: false }));
  glow.position.z = -0.22; g.add(glow);
  g.userData = { w, h };
  return g;
}
function loadTex(name) { return new Promise((res) => loader.load(`shots/${name}.png`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); })); }

// ───────── جزيئات وأشعة ─────────
const dust = (() => {
  const r = rng(9); const n = 900; const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 40; p[i * 3 + 1] = -3 + r() * 16; p[i * 3 + 2] = (r() - 0.5) * 40; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: C.mint, size: 0.06, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(m); return m;
})();
function beam(color, h = 18, r = 3.2) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.55, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 40, 1, true), new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.position.y = h / 2 - 3.2; return m;
}
const beamA = beam(C.mint); scene.add(beamA);
const beamB = beam(C.gold, 18, 2.4); scene.add(beamB);

// ───────── البوست ─────────
const composer = new EffectComposer(renderer); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.6, 0.9); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uFlash: { value: 0 }, uAb: { value: 0.0012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; uniform float uFlash; uniform float uAb; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))+uT*37.0)*43758.5453); }
    void main(){ vec2 d=vUv-0.5; float r=length(d);
      vec3 c; c.r=texture2D(tDiffuse, vUv+d*uAb*(1.0+r*6.0)).r; c.g=texture2D(tDiffuse, vUv).g; c.b=texture2D(tDiffuse, vUv-d*uAb*(1.0+r*6.0)).b;
      c*=smoothstep(1.05,0.25,r); c+= (h(vUv*vec2(1080.0,1920.0))-0.5)*0.035; c=mix(c, vec3(1.0), uFlash);
      gl_FragColor=vec4(c,1.0); }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ───────── المشاهد ─────────
const T = {};
const V = new THREE.Vector3();
function mk(name, lines, h, o) { T[name] = (o && o.thick ? thickText : textMesh)(lines, h, o); T[name].visible = false; scene.add(T[name]); }
function buildTexts() {
  mk('q1', 'عندك محل؟', 1.5, { size: 220 });
  mk('q2a', 'لسّا عالدفتر', 1.25, { size: 220 });
  mk('q2b', 'والآلة الحاسبة؟', 1.25, { size: 220, color: '#ff5a5a', glow: 'rgba(255,0,0,0.6)' });
  mk('wazn', 'وزن', 3.4, { size: 300, gold: true, depth: 1.1, thick: true });
  mk('k_inv', 'الفاتورة بكبستين', 1.2, { size: 200, gold: true, glow: 'rgba(255,190,60,0.5)' });
  mk('k_print', 'وبتنطبع فوراً', 1.2, { size: 200 });
  mk('k_stock', ['المخزون', 'بينقص لحالو'], 2.2, { size: 200, mint: true, glow: 'rgba(60,255,190,0.35)' });
  mk('k_debt', ['كل زبون', 'حسابه قدّامك'], 2.2, { size: 200 });
  mk('k_cash0', ['شو فات', 'وشو طلع'], 2.2, { size: 200 });
  mk('k_day', 'آخر النهار…', 1.2, { size: 200 });
  mk('k_cash', 'ليرة بليرة', 1.3, { size: 210, gold: true, glow: 'rgba(255,190,60,0.5)' });
  mk('k_profit', ['قدّيش ربحت', 'اليوم؟'], 2.3, { size: 200, mint: true, glow: 'rgba(60,255,190,0.4)' });
  mk('k_item', ['أي مادة', 'عم تربّحك'], 2.2, { size: 200 });
  mk('off1', 'وكل هاد…', 1.2, { size: 200 });
  mk('off2', ['بدون', 'إنترنت'], 3.6, { size: 280, gold: true, depth: 1.0, thick: true });
  mk('r0', ['وإذا إنت', 'مش بالمحل؟'], 2.6, { size: 210 });
  mk('r1', 'هون الحلو', 1.6, { size: 230, gold: true, glow: 'rgba(255,190,60,0.6)' });
  mk('r2', 'الاتصال عن بعد', 1.25, { size: 200, mint: true, glow: 'rgba(60,255,190,0.4)' });
  mk('r3', ['وإنت بالبيت…', 'محلّك قدّامك'], 2.2, { size: 190 });
  mk('r4', 'من أي مكان', 1.3, { size: 210, gold: true, glow: 'rgba(255,190,60,0.5)' });
  mk('s1', ['التنصيب', 'والشرح'], 2.6, { size: 220 });
  mk('s2', 'علينا', 2.4, { size: 300, gold: true, depth: 0.8, thick: true });
  mk('s3', 'ومنضل معك', 1.2, { size: 200, mint: true });
  mk('pct', '25%', 4.6, { size: 320, gold: true, depth: 1.6, layers: 34, thick: true });
  mk('off', 'خصم', 1.3, { size: 220 });
  mk('lim', 'لفترة محدودة', 0.9, { size: 180, mint: true });
  mk('tag', 'محلّك كله بجيبتك', 1.05, { size: 200 });
  mk('site', 'waznsy.com', 0.95, { size: 200, gold: true, weight: 700 });
  mk('wa', ['واتساب', '\u202D0968 037 609  ·  0980 072 891\u202C'], 1.15, { size: 130, weight: 700, color: '#bfeee0' });
}
function show(m, o = 1) { m.visible = o > 0.001; m.traverse((x) => { if (x.material && x.material.transparent) x.material.opacity = o; }); }
const viewW = (d) => 2 * d * Math.tan((cam.fov * Math.PI) / 360) * (W / H);
/** نص بيواجه الكاميرا عند نقطة بالعالم، بيتصغّر لحاله ليوسع بالمنطقة الآمنة */
function put(m, x, y, z, k = 1, o = 1, rotY = 0) {
  m.position.set(x, y, z); m.quaternion.copy(cam.quaternion); if (rotY) m.rotateY(rotY);
  const d = V.copy(m.position).sub(cam.position).length();
  const fit = Math.min(1, (0.8 * viewW(d)) / m.userData.w);
  m.scale.setScalar(fit * k); show(m, o);
  return fit;
}
/** نص فوق الجوال: أسفله ثابت عند baseY (حتى السطرين ما ينقصّوا من فوق) */
function above(m, baseY, z, k, o) { const f = put(m, 0, baseY, z, k, o); m.position.y = baseY + (m.userData.h * f) / 2; }
const pop = (t, a, d = 0.5) => eo5(seg(t, a, a + d));
const sc = (t, a, d = 0.55) => lerp(1.7, 1, eo5(seg(t, a, a + d)));
const out = (t, b, d = 0.25) => 1 - seg(t, b - d, b);

function hideAll() {
  Object.values(T).forEach((m) => (m.visible = false));
  phone.visible = false; shop.visible = false;
  receipts.visible = false; redNums.visible = false; beamA.visible = false; beamB.visible = false;
}
const flashAt = (t, at, w = 0.14, s = 0.7) => Math.max(0, 1 - Math.abs(t - at) / w) * s;

function sceneChaos(t) {
  receipts.visible = true; redNums.visible = t < 5.9;
  const suck = eio(seg(t, 5.3, 6.6));
  const ang = t * 0.42;
  cam.position.set(Math.sin(ang) * lerp(10.5, 8.5, suck), lerp(1.2, 2.2, seg(t, 0, 5)), Math.cos(ang) * lerp(10.5, 8.5, suck));
  cam.lookAt(0, 1.4, 0); cam.rotation.z += Math.sin(t * 1.3) * 0.035 * (1 - suck);
  for (const { m, d } of rc) {
    const a = d.a + t * d.sp * (1 + suck * 6);
    const rad = d.rad * (1 - suck) + 0.02;
    m.position.set(Math.cos(a) * rad, lerp(d.y + Math.sin(t * 0.9 + d.ph * 9) * 0.5, 1.6, suck), Math.sin(a) * rad);
    m.rotation.set(d.tw + t * d.tws, a * 1.3, Math.sin(t * d.tws + d.ph * 6) * 0.9);
    m.scale.setScalar(d.s * (1 - suck * 0.97));
  }
  for (const { m, d } of rn) {
    const a = d.a + t * d.sp; m.position.set(Math.cos(a) * d.rad, d.y + Math.sin(t + d.a) * 0.4, Math.sin(a) * d.rad); m.quaternion.copy(cam.quaternion);
    show(m, seg(t, 0.3, 1.0) * (1 - seg(t, 5.2, 5.9)) * (0.55 + 0.45 * Math.sin(t * 7 + d.a * 5)));
  }
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const at = (dist, up) => V.copy(cam.position).addScaledVector(dir, dist).add(new THREE.Vector3(0, up, 0)).clone();
  let p = at(6.5, 0.3); put(T.q1, p.x, p.y, p.z, sc(t, 0.15), pop(t, 0.15) * out(t, 2.75));
  p = at(6.5, 0.95); put(T.q2a, p.x, p.y, p.z, sc(t, 2.8), pop(t, 2.8) * out(t, 5.45));
  p = at(6.5, -0.45); put(T.q2b, p.x, p.y, p.z, sc(t, 3.7), pop(t, 3.7) * out(t, 5.45));
  const w = seg(t, 6.25, 6.9);
  if (w > 0) { put(T.wazn, 0, 1.6, 0, back(clamp(w)), 1, lerp(-1.0, 0.25, eo5(w))); beamB.visible = true; beamB.position.x = 0; beamB.position.z = 0; beamB.material.opacity = 0.3 * w; }
  grade.uniforms.uFlash.value = flashAt(t, 6.35, 0.16, 0.85);
  bloom.strength = 0.45 + 0.8 * Math.max(0, 1 - Math.abs(t - 6.4) / 0.5);
}

// مشاهد الميزات: جوال واحد بيلف لفّة كاملة عند كل انتقال والشاشة بتتبدّل
const BEATS = [
  { a: 7.1, tex: 'm-sale', kw: 'k_inv', side: 1 },
  { a: 9.64, tex: 'm-invoice', kw: 'k_print', side: 1 },
  { a: 11.38, tex: 'm-items', kw: 'k_stock', side: -1 },
  { a: 15.22, tex: 'm-debts', kw: 'k_debt', side: 1 },
  { a: 19.52, tex: 'm-cash', kw: 'k_cash', kw0: 'k_cash0', side: -1, kwAt: 22.2 },
  { a: 23.96, tex: 'm-home3', kw: 'k_profit', kw0: 'k_day', side: 1, kwAt: 25.4 },
  { a: 27.84, tex: 'm-watch', kw: 'k_item', side: -1 },
];
const F_END = 31.04;
function sceneFeatures(t) {
  let i = 0; while (i < BEATS.length - 1 && t >= BEATS[i + 1].a) i++;
  const b = BEATS[i]; const end = i < BEATS.length - 1 ? BEATS[i + 1].a : F_END;
  phone.visible = true; phone.scale.setScalar(1);
  // اللفّة حوالين كل حدّ: منبدّل الصورة لما يكون ظهر الجوال للكاميرا
  let spin = 0, texName = b.tex;
  const nb = BEATS[i + 1];
  if (nb && t > nb.a - 0.28) { const k = seg(t, nb.a - 0.28, nb.a + 0.28); spin = eio(k) * Math.PI * 2; }
  if (i > 0 && t < b.a + 0.28) { const k = seg(t, b.a - 0.28, b.a + 0.28); spin = eio(k) * Math.PI * 2; }
  setPhoneTex(texName);
  const first = eo5(seg(t, 7.1, 7.9));
  const p = seg(t, b.a, end);
  const sway = Math.sin(t * 0.7) * 0.06;
  phone.position.set(0, lerp(-7, 0.95, first) + Math.sin(t * 1.1) * 0.05, 0);
  phone.rotation.set(-0.06, b.side * (0.42 - p * 0.2) + sway + spin, b.side * 0.03);
  const camSide = lerp(BEATS[Math.max(0, i - 1)].side, b.side, eio(seg(t, b.a - 0.3, b.a + 0.5)));
  cam.position.set(camSide * -1.6, 2.3, lerp(13.9, 12.9, eo(p))); cam.lookAt(0, 2.0, 0);
  beamA.visible = true; beamA.position.set(0, beamA.position.y, -1.5); beamA.material.opacity = 0.13;
  const ka = b.kwAt ?? b.a + 0.35; const kw = T[b.kw];
  above(kw, 4.35, 0.6, sc(t, ka), pop(t, ka) * out(t, end, 0.2));
  if (b.kw0) above(T[b.kw0], 4.35, 0.6, sc(t, b.a + 0.35), pop(t, b.a + 0.35) * out(t, ka, 0.2));
  let fl = 0; for (const x of BEATS) fl = Math.max(fl, flashAt(t, x.a, 0.1, 0.35));
  grade.uniforms.uFlash.value = fl; bloom.strength = 0.42;
}

function sceneOffline(t) {
  // 31.04 – 33.74
  const a = 31.04; const p = seg(t, a, 33.74);
  cam.position.set(Math.sin(p * 0.5 - 0.25) * 3, 2.4, lerp(14, 12.4, eo(p))); cam.lookAt(0, 2.4, 0);
  beamB.visible = true; beamB.position.set(0, beamB.position.y, 0); beamB.material.opacity = 0.3;
  put(T.off1, 0, 5.6, 0, sc(t, a + 0.1), pop(t, a + 0.1));
  const k = seg(t, 32.0, 32.6); put(T.off2, 0, 2.2, 0, k > 0 ? back(k) : 0.001, k > 0 ? 1 : 0, lerp(1.1, -0.2, eo5(k)) + p * 0.2);
  grade.uniforms.uFlash.value = flashAt(t, 32.05, 0.12, 0.7); bloom.strength = 0.6;
}

function sceneRemote(t) {
  const a = 33.74, b = 50.84; const p = seg(t, a, b);
  // 33.7–37.3: سؤال + «هون الحلو»
  if (t < 37.3) {
    cam.position.set(0, 2.4, lerp(13.5, 12.6, seg(t, a, 37.3))); cam.lookAt(0, 2.4, 0);
    put(T.r0, 0, 3.2, 0, sc(t, a + 0.1), pop(t, a + 0.1) * out(t, 35.9));
    const k = seg(t, 35.9, 36.4); put(T.r1, 0, 2.6, 0, k > 0 ? back(k) : 0.001, (k > 0 ? 1 : 0) * out(t, 37.3, 0.2));
    beamB.visible = t > 35.9; beamB.position.set(0, beamB.position.y, 0); beamB.material.opacity = 0.35;
    grade.uniforms.uFlash.value = flashAt(t, 35.95, 0.12, 0.6); bloom.strength = 0.6; return;
  }
  const q = seg(t, 37.3, b);
  shop.visible = true; shop.position.set(-2.1, 3.2, -9); shop.rotation.set(0, 0.35, 0); shop.scale.setScalar(lerp(0.6, 1, eo5(seg(t, 37.3, 38.1))));
  phone.visible = true; setPhoneTex(t < 45.26 ? 'm-home2' : t < 46.6 ? 'm-sale' : t < 47.92 ? 'm-cash' : 'm-reports');
  const inn = eo5(seg(t, 39.24, 40.1));
  let spin = 0; for (const x of [45.26, 46.6, 47.92]) if (Math.abs(t - x) < 0.25) spin = eio(seg(t, x - 0.25, x + 0.25)) * Math.PI * 2;
  phone.position.set(0.9, lerp(-8, 0.2, inn), 1.2); phone.rotation.set(-0.05, -0.38 + q * 0.3 + spin, 0.02); phone.scale.setScalar(0.92);
  cam.position.set(lerp(-1.2, 0.8, eo(q)), 2.6, lerp(15.5, 13.2, eo(q))); cam.lookAt(0, 2.5, 0);
  beamA.visible = true; beamA.position.set(-2.1, beamA.position.y, -9); beamA.material.opacity = 0.3;
  arc.visible = t > 40.6; arc.material.uniforms.uP.value = eo(seg(t, 40.6, 42.2)); arc.material.uniforms.uT.value = t;
  above(T.r2, 5.9, 2, sc(t, 37.4), pop(t, 37.4) * out(t, 40.8));
  above(T.r3, 5.35, 2, sc(t, 40.9), pop(t, 40.9) * out(t, 47.9));
  above(T.r4, 5.8, 2, sc(t, 49.3), pop(t, 49.3));
  grade.uniforms.uFlash.value = flashAt(t, 39.3, 0.1, 0.3); bloom.strength = 0.5;
}

function sceneSupport(t) {
  const a = 50.84; const p = seg(t, a, 57.18);
  cam.position.set(Math.sin(p * 0.6 - 0.3) * 3.2, 2.4, lerp(14, 12.6, eo(p))); cam.lookAt(0, 2.5, 0);
  beamA.visible = true; beamA.position.set(0, beamA.position.y, 0); beamA.material.opacity = 0.3;
  put(T.s1, 0, 4.9, 0, sc(t, a + 0.1), pop(t, a + 0.1));
  const k = seg(t, 52.64, 53.2); put(T.s2, 0, 1.75, 0, k > 0 ? back(k) : 0.001, k > 0 ? 1 : 0, lerp(-1.1, 0.2, eo5(k)) - p * 0.15);
  put(T.s3, 0, -0.55, 0.5, sc(t, 55.8), pop(t, 55.8));
  grade.uniforms.uFlash.value = flashAt(t, 52.7, 0.12, 0.6); bloom.strength = 0.55;
}

function sceneOffer(t) {
  const a = 57.18, b = 62.14; const p = seg(t, a, b);
  cam.position.set(Math.sin(p * 0.9 - 0.45) * 4.5, 2.4, lerp(15, 12.6, eo(p))); cam.lookAt(0, 2.6, 0);
  beamB.visible = true; beamB.position.set(0, beamB.position.y, 0); beamB.material.opacity = 0.42;
  put(T.off, 0, 5.9, 0, sc(t, a + 0.2), pop(t, a + 0.2));
  const k = seg(t, 58.5, 59.2); put(T.pct, 0, 2.6, 0, k > 0 ? back(k) : 0.001, k > 0 ? 1 : 0, lerp(1.2, -0.28, eo5(k)) + p * 0.3);
  put(T.lim, 0, -0.6, 1.0, sc(t, 60.8), pop(t, 60.8));
  sparks.visible = t > 58.5; sparks.position.y = 0.4; sparks.material.uniforms.uT.value = Math.max(0, t - 58.55);
  grade.uniforms.uFlash.value = flashAt(t, 58.6, 0.14, 0.9); bloom.strength = 0.7;
}

let logo;
function sceneEnd(t) {
  const a = 62.14; const p = seg(t, a, 68.8);
  cam.position.set(0, 2.4, lerp(13.6, 12.6, eo(p))); cam.lookAt(0, 2.6, 0);
  beamA.visible = true; beamA.position.set(0, beamA.position.y, -1); beamA.material.opacity = 0.3;
  const k = seg(t, a, a + 0.6); logo.visible = true; logo.position.set(0, 5.5, 0); logo.scale.setScalar(k > 0 ? back(k) * 0.8 : 0.001); logo.rotation.y = lerp(1.5, 0, eo5(k)) + Math.sin(t * 0.8) * 0.06;
  put(T.tag, 0, 3.35, 0, sc(t, 63.14), pop(t, 63.14));
  put(T.site, 0, 1.75, 0, sc(t, 65.12), pop(t, 65.12));
  put(T.wa, 0, 0.1, 0, sc(t, 67.4), pop(t, 67.4));
  grade.uniforms.uFlash.value = flashAt(t, a + 0.05, 0.12, 0.6); bloom.strength = 0.55;
}

const arc = (() => {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-2.1, 3.2, -9), new THREE.Vector3(-1.0, 7.6, -3.5), new THREE.Vector3(0.9, 3.1, 1.2));
  const geo = new THREE.TubeGeometry(curve, 140, 0.05, 8, false);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uP: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uP; uniform float uT; varying vec2 vUv; void main(){ float on=step(vUv.x,uP); float pulse=0.55+0.45*sin(vUv.x*40.0-uT*9.0); gl_FragColor=vec4(vec3(0.45,1.0,0.82)*(0.8+pulse*1.6), on); }' });
  const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m); return m;
})();
const sparks = (() => {
  const r = rng(77); const n = 700; const p = new Float32Array(n * 3); const v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const th = r() * 6.283, ph = Math.acos(2 * r() - 1), sp = 2 + r() * 9; v[i * 3] = Math.sin(ph) * Math.cos(th) * sp; v[i * 3 + 1] = Math.cos(ph) * sp + 2; v[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp; p[i * 3 + 1] = 2.2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('vel', new THREE.BufferAttribute(v, 3));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 } },
    vertexShader: 'attribute vec3 vel; uniform float uT; varying float vA; void main(){ vec3 p=position+vel*uT*(1.0/(1.0+uT*0.9)); p.y-=uT*uT*0.9; vA=clamp(1.0-uT/2.6,0.0,1.0); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=(26.0*vA+4.0)/-mv.z*6.0; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(1.0,0.82,0.42,a); }' });
  const m = new THREE.Points(g, mat); m.visible = false; m.frustumCulled = false; scene.add(m); return m;
})();

window.render = (t) => {
  hideAll(); arc.visible = false; sparks.visible = false; if (logo) logo.visible = false;
  grade.uniforms.uFlash.value = 0; grade.uniforms.uT.value = t; cam.rotation.set(0, 0, 0);
  dust.rotation.y = t * 0.02; dust.position.y = Math.sin(t * 0.2) * 0.3;
  if (t < 7.1) sceneChaos(t);
  else if (t < F_END) sceneFeatures(t);
  else if (t < 33.74) sceneOffline(t);
  else if (t < 50.84) sceneRemote(t);
  else if (t < 57.18) sceneSupport(t);
  else if (t < 62.14) sceneOffer(t);
  else sceneEnd(t);
  composer.render();
};

// ───────── الجوال ─────────
let phone, shop; const ptex = {};
function setPhoneTex(n) { if (phone.userData.cur !== n) { phone.userData.scr.material.map = ptex[n]; phone.userData.scr.material.needsUpdate = true; phone.userData.cur = n; } }
function buildPhone() {
  const w = 2.75, h = w * (844 / 390);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(w + 0.2, h + 0.2, 0.42), { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 4, curveSegments: 16 }), new THREE.MeshStandardMaterial({ color: 0x10201c, roughness: 0.22, metalness: 0.95 }));
  body.position.z = -0.24; g.add(body);
  const geo = new THREE.ShapeGeometry(roundedShape(w, h, 0.33), 16);
  const p = geo.attributes.position; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const scr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd9d9d9, toneMapped: false })); scr.position.z = 0.012; g.add(scr);
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(w + 0.9, h + 0.9, 0.7), 12), new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0.0, depthWrite: false }));
  glow.position.z = -0.3;
  // ظهر الجوال: لوغو وزن
  const backLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: ptex.icon, toneMapped: false, color: 0xbbbbbb })); backLogo.rotation.y = Math.PI; backLogo.position.z = -0.29; g.add(backLogo);
  g.userData.scr = scr; g.visible = false; scene.add(g); return g;
}
(async () => {
  for (const [w, f] of [[700, 'cairo-arabic-700-normal'], [900, 'cairo-arabic-900-normal'], [700, 'cairo-latin-700-normal'], [900, 'cairo-latin-900-normal']]) {
    const ff = new FontFace('Cairo', `url(fonts/${f}.woff2)`, { weight: String(w) }); await ff.load(); document.fonts.add(ff);
  }
  await document.fonts.ready;
  buildReceipts(); buildRedNums(); buildTexts();
  for (const n of ['m-sale', 'm-invoice', 'm-items', 'm-debts', 'm-cash', 'm-home2', 'm-home3', 'm-watch', 'm-reports', 'icon']) ptex[n] = await loadTex(n);
  phone = buildPhone();
  { const tex = await loadTex('d-shop'); shop = panel(tex, 6.2, 6.2 * (860 / 1366)); shop.visible = false; scene.add(shop); }
  { logo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: ptex.icon, toneMapped: false, transparent: true, side: THREE.DoubleSide })); logo.visible = false; scene.add(logo); }
  window.READY = true;
})();
