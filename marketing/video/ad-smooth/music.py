# موسيقى ومؤثرات إعلان وزن «السلس»: بيانو كهربائي دافي + باص ناعم + إيقاع خفيف (100 BPM)، ومؤثرات مربوطة بالحركة، والموسيقى بتنزل تحت الصوت.
# python3 music.py <out.wav> <voice.mp3> <duration>
import sys, wave, subprocess
import numpy as np

SR = 44100
out_path, vo_path, DUR = sys.argv[1], sys.argv[2], float(sys.argv[3])
N = int(SR * DUR)
rng = np.random.default_rng(21)
M = np.zeros((N, 2))  # موسيقى
F = np.zeros((N, 2))  # مؤثرات

def tarr(n): return np.arange(n) / SR
def filt(x, lo=None, hi=None, order=4):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** order)
    if lo: X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** order)
    return np.fft.irfft(X, len(x))
def env(n, a, d):
    e = np.ones(n); na = min(n, max(1, int(a * SR))); nd = min(n, max(1, int(d * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nd:] *= np.linspace(1, 0, nd); return e
def add(buf, sig, at, g=1.0, pan=0.0):
    i = int(round(at * SR))
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.414; r = np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def noise(n): return rng.standard_normal(n)

BEAT = 0.6; BAR = 2.4; T0 = 1.2   # نزلة الإيقاع الكامل عند «وزن» (6.0)
DROP = 6.0

# ── الآلات
def epiano(m, dur, vel=1.0):
    n = int(dur * SR); t = tarr(n); f = note(m)
    s = np.sin(2 * np.pi * f * t) + 0.42 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3.5) + 0.16 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 6)
    s += 0.10 * np.sin(2 * np.pi * 7.02 * f * t) * np.exp(-t * 16)            # رنّة الجرس بأول النوتة
    s *= np.exp(-t * 1.9) * (1 + 0.06 * np.sin(2 * np.pi * 4.6 * t))           # تريمولو خفيف
    return s * env(n, 0.006, 0.12) * vel
def pad(ms, dur):
    n = int(dur * SR); t = tarr(n); s = np.zeros(n)
    for m in ms:
        for d in (-0.07, 0.0, 0.07):
            f = note(m) * 2 ** (d / 12); ph = rng.random()
            s += 2 * ((t * f + ph) % 1.0) - 1
    return filt(s / (len(ms) * 3), hi=900) * env(n, min(0.9, dur * 0.4), min(0.9, dur * 0.4))
def bass(m, dur):
    n = int(dur * SR); t = tarr(n); f = note(m)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    return s * env(n, 0.012, 0.09) * np.exp(-t * 1.2)
def pluck(m, dur=0.5):
    n = int(dur * SR); t = tarr(n); f = note(m)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 14) + 0.2 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30)
    return s * np.exp(-t * 7.5) * env(n, 0.003, 0.05)
def kick():
    n = int(0.36 * SR); t = tarr(n); f = 44 + 70 * np.exp(-t * 26)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5) * env(n, 0.002, 0.05)
def snap():
    n = int(0.16 * SR); t = tarr(n)
    return filt(noise(n), lo=1400, hi=6500) * np.exp(-t * 36) + 0.35 * np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 90)
def shaker(g=1.0):
    n = int(0.07 * SR); t = tarr(n)
    return filt(noise(n), lo=6500) * np.exp(-t * 55) * env(n, 0.006, 0.02) * g

# ── التآلفات (فا ماجور، دافية ومتفائلة): Bbmaj7 | C6/9 | Dm7 | Fmaj7
PROG = [
    (46, [58, 62, 65, 69]),   # Bb  : Bb D F A
    (48, [60, 64, 67, 69]),   # C   : C E G A
    (50, [57, 60, 62, 65]),   # Dm7 : A C D F
    (41, [57, 60, 64, 65]),   # F   : A C E F
]
ARP = [0, 2, 1, 3, 2, 1, 3, 2]

def bar_at(t):  # رقم البار (0 عند T0)
    return int(np.floor((t - T0) / BAR + 1e-6))

t = T0 - BAR  # بار تمهيدي (من -1.2): بس pad
k = -1
while t < DUR:
    root, ch = PROG[k % 4]
    full = t >= DROP - 1e-6
    half = t >= 3.6 - 1e-6
    # pad دايماً (أخف بعد النزلة)
    p = pad(ch, BAR + 0.5)
    add(M, p, t, 0.20 if full else 0.30, -0.3); add(M, p, t + 0.013, 0.20 if full else 0.30, 0.3)
    if t >= 0:
        # بيانو كهربائي: ضربة عالأول + نبضات عكس الإيقاع
        for j, (off, vel) in enumerate([(0.0, 1.0), (1.5, 0.6), (2.5, 0.75), (3.5, 0.5)] if full else [(0.0, 0.9), (2.5, 0.5)]):
            at = t + off * BEAT
            for i, m in enumerate(ch):
                add(M, epiano(m, 1.5, vel), at + i * 0.012, 0.085, -0.45 + i * 0.3)
        if half:
            for j in range(8):
                at = t + j * BEAT / 2
                m = ch[ARP[j]] + 12
                add(M, pluck(m), at, 0.045 if not full else 0.06, 0.55 - (j % 4) * 0.36)
    if full:
        for j in range(4):
            bt = t + j * BEAT
            if j in (0, 2): add(M, kick(), bt, 0.62)
            if j == 3: add(M, kick(), bt + BEAT / 2, 0.38)
            if j in (1, 3): add(M, snap(), bt, 0.20, 0.08)
            for q in range(4):
                add(M, shaker(1.0 if q % 2 == 0 else 0.55), bt + q * BEAT / 4 + (0.012 if q % 2 else 0), 0.09, -0.3 if q % 2 else 0.3)
        # باص: الجذر على 1 و«2و» و4
        for off, ln in [(0.0, 1.3), (1.5, 0.9), (3.0, 0.9)]:
            add(M, bass(root if off < 3 else root + 7 if root < 46 else root - 5, ln * BEAT), t + off * BEAT, 0.34)
    elif half:
        for j in range(4):
            for q in (0, 2):
                add(M, shaker(0.8), t + j * BEAT + q * BEAT / 4, 0.06, 0.3 if q else -0.3)
        add(M, bass(root, 2.0 * BEAT), t, 0.2)
    t += BAR; k += 1

# sidechain خفيف مع الكيك بعد النزلة
tt = tarr(N)
ph = ((tt - T0) % (2 * BEAT))
pump = 1 - 0.22 * np.exp(-ph / 0.09) * (tt >= DROP)
M *= pump[:, None]

# ── المؤثرات
def whoosh(dur, lo=300, hi=5200, g=1.0, rise=0.5):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    e = np.sin(np.pi * x ** rise) ** 2
    s = noise(n)
    # فلتر بيتحرك: منمزج نسختين (واطية وعالية) حسب الوقت
    a = filt(s, lo=lo, hi=hi * 0.35); b = filt(s, lo=lo * 2.5, hi=hi)
    return (a * (1 - x) + b * x) * e * g
def pop(f=520, g=1.0):
    n = int(0.09 * SR); t = tarr(n)
    return np.sin(2 * np.pi * (f + f * 0.9 * np.exp(-t * 60)) * t) * np.exp(-t * 55) * g
def tick(f=2300):
    n = int(0.035 * SR); t = tarr(n)
    return (np.sin(2 * np.pi * f * t) * 0.6 + filt(noise(n), lo=3000) * 0.4) * np.exp(-t * 160)
def blip(m, dur=0.16, g=1.0):
    n = int(dur * SR); t = tarr(n)
    return (np.sin(2 * np.pi * note(m) * t) + 0.3 * np.sin(2 * np.pi * 2 * note(m) * t)) * np.exp(-t * 22) * env(n, 0.003, 0.03) * g
def bell(m, dur=1.2, g=1.0):
    n = int(dur * SR); t = tarr(n); f = note(m)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 6) + 0.25 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 12)
    return s * np.exp(-t * 4.2) * env(n, 0.002, 0.1) * g
def scratch(dur=0.24):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    return filt(noise(n), lo=1800, hi=7500) * np.sin(np.pi * x) ** 1.5 * (0.7 + 0.3 * np.sin(2 * np.pi * 38 * x))
def printer(dur):
    n = int(dur * SR); t = tarr(n)
    step = (np.sin(2 * np.pi * 31 * t) > 0.15).astype(float)      # نبضات تغذية الورق
    s = filt(noise(n), lo=900, hi=4200) * (0.35 + 0.65 * step) + 0.22 * np.sign(np.sin(2 * np.pi * 248 * t)) * step
    return filt(s, lo=300, hi=6000) * env(n, 0.03, 0.08)
def bloom():
    # ضربة ناعمة + تلألؤ لحظة اللوغو
    n = int(2.2 * SR); t = tarr(n)
    sub = np.sin(2 * np.pi * np.cumsum(46 + 40 * np.exp(-t * 14)) / SR) * np.exp(-t * 3.2)
    sh = np.zeros(n)
    for m, d in [(77, 0.0), (81, 0.03), (84, 0.06), (89, 0.09), (93, 0.12)]:
        k0 = int(d * SR); tt_ = t[: n - k0]
        sh[k0:] += np.sin(2 * np.pi * note(m) * tt_) * np.exp(-tt_ * 2.6) * 0.2
    air = filt(noise(n), lo=5000) * np.exp(-t * 3.0) * 0.12
    return sub * 0.9 + sh + air

def sfx(events):
    for e in events:
        k_, at = e[0], e[1]
        if k_ == 'whoosh': add(F, whoosh(e[2], g=1.0), at, e[3] if len(e) > 3 else 0.22, e[4] if len(e) > 4 else 0.0)
        elif k_ == 'pop': add(F, pop(e[2] if len(e) > 2 else 520), at, 0.3)
        elif k_ == 'tick': add(F, tick(), at, 0.22)
        elif k_ == 'tap': add(F, tick(1700), at, 0.3); add(F, blip(e[2], 0.14), at + 0.012, 0.12)
        elif k_ == 'blip': add(F, blip(e[2], 0.18), at, e[3] if len(e) > 3 else 0.14)
        elif k_ == 'bell': add(F, bell(e[2], 1.1), at, e[3] if len(e) > 3 else 0.12)
        elif k_ == 'scratch': add(F, scratch(), at, 0.2, e[2] if len(e) > 2 else 0)
        elif k_ == 'printer': add(F, printer(e[2]), at, 0.2)
        elif k_ == 'bloom': add(F, bloom(), at, 0.5)
        elif k_ == 'riser':
            n = int(e[2] * SR); x = np.linspace(0, 1, n)
            add(F, filt(noise(n), lo=700, hi=9000) * x ** 2.2 * 0.6 + np.sin(2 * np.pi * np.cumsum(260 + 700 * x ** 2) / SR) * x ** 2 * 0.12, at, 0.3)

EVENTS = [
    ('whoosh', 2.42, 0.95, 0.2), ('scratch', 4.72, -0.2), ('scratch', 4.88, 0.2),
    ('riser', 5.16, 0.86), ('bloom', 6.0), ('whoosh', 6.58, 0.66, 0.2), ('pop', 7.12, 420),
    ('tap', 7.8, 81), ('tap', 8.22, 84), ('whoosh', 8.82, 0.7, 0.2), ('blip', 9.32, 84, 0.13), ('blip', 9.42, 88, 0.13), ('pop', 8.98, 620),
    ('printer', 9.72, 0.95), ('tick', 10.7), ('pop', 10.58, 620),
    ('whoosh', 11.06, 1.0, 0.24, -0.3), ('pop', 11.52, 460), ('pop', 11.65, 520), ('blip', 11.92, 79, 0.15), ('blip', 12.0, 76, 0.13), ('blip', 12.3, 79, 0.15), ('blip', 12.38, 76, 0.13), ('pop', 12.4, 620),
    ('whoosh', 12.56, 0.95, 0.24, -0.3), ('pop', 13.02, 440), ('bell', 13.18, 86, 0.13), ('bell', 13.34, 91, 0.11), ('tick', 13.56), ('tick', 13.94), ('tick', 14.28),
    # الديون
    ('whoosh', 14.96, 0.95, 0.24, -0.3), ('pop', 15.52, 440), ('pop', 16.12, 480), ('pop', 16.52, 520), ('pop', 17.3, 620), ('blip', 18.02, 84, 0.14), ('blip', 18.76, 77, 0.14),
    # الصندوق
    ('whoosh', 19.26, 0.95, 0.24, -0.3), ('pop', 19.88, 440), ('blip', 20.94, 81, 0.13), ('blip', 21.56, 76, 0.13), ('pop', 22.24, 500), ('pop', 22.88, 540), ('pop', 23.08, 620),
    # الربح
    ('whoosh', 23.7, 0.95, 0.24, -0.3), ('pop', 24.52, 440), ('tap', 25.38, 84), ('blip', 25.5, 88, 0.12), ('blip', 25.6, 91, 0.12), ('pop', 26.52, 480), ('pop', 27.04, 620),
    ('whoosh', 27.52, 0.95, 0.24, -0.3), ('pop', 28.24, 440), ('blip', 28.7, 84, 0.13), ('pop', 29.52, 480), ('blip', 30.2, 84, 0.13),
    # بدون إنترنت / السؤال
    ('whoosh', 30.78, 0.95, 0.24, -0.3), ('pop', 31.96, 420), ('scratch', 32.45, 0.0), ('pop', 32.58, 620),
    ('whoosh', 33.46, 0.95, 0.24, -0.3), ('pop', 36.5, 620), ('blip', 36.42, 84, 0.12), ('blip', 36.52, 88, 0.12),
    # عن بعد
    ('whoosh', 36.92, 0.95, 0.24, -0.3), ('pop', 37.94, 480), ('pop', 38.58, 540), ('pop', 38.7, 620), ('whoosh', 39.15, 0.8, 0.2), ('pop', 41.36, 620),
    ('whoosh', 42.46, 0.7, 0.18), ('bell', 43.52, 86, 0.1), ('pop', 44.46, 620), ('whoosh', 45.22, 0.5, 0.16), ('pop', 45.8, 620), ('whoosh', 46.56, 0.5, 0.16), ('pop', 47.2, 620), ('whoosh', 47.88, 0.5, 0.16), ('pop', 50.34, 620),
    # التنصيب
    ('whoosh', 50.52, 0.95, 0.24, -0.3), ('pop', 52.74, 620), ('blip', 52.66, 84, 0.14), ('blip', 52.78, 91, 0.14), ('blip', 53.72, 84, 0.12), ('blip', 54.82, 86, 0.12), ('blip', 56.02, 88, 0.12),
    # العرض والخاتمة
    ('riser', 56.5, 0.6), ('whoosh', 56.96, 0.7, 0.22), ('pop', 58.52, 440), ('bloom', 59.2), ('tick', 59.3), ('tick', 59.4), ('tick', 59.5), ('tick', 59.6), ('tick', 59.72), ('tick', 59.86), ('pop', 60.78, 520),
    ('whoosh', 61.8, 0.6, 0.2), ('bloom', 62.2), ('pop', 65.88, 520), ('pop', 67.46, 480), ('pop', 67.68, 520),
]
sfx([e for e in EVENTS if e[1] < DUR])

# ── الصوت + ducking
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', vo_path, '-t', str(DUR), '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
vo = filt(vo, lo=70)
vo *= 0.89 / max(1e-6, np.max(np.abs(vo)))
# ظرف الصوت ← الموسيقى بتنزل تحته
w = int(0.03 * SR); e = np.sqrt(np.convolve(vo ** 2, np.ones(w) / w, mode='same'))
e = np.maximum.accumulate(e[::-1] * 0 + e)  # نسخة
att = int(0.04 * SR); rel = int(0.35 * SR)
g = np.zeros(N); cur = 0.0
ea = e / max(1e-6, np.percentile(e, 95))
for i in range(0, N, 64):
    tgt = min(1.0, ea[i] * 1.6)
    cur += (tgt - cur) * (64 / att if tgt > cur else 64 / rel)
    g[i:i + 64] = cur
duck = 1 - 0.56 * np.clip(g, 0, 1)          # ≈ −7 dB تحت الكلام
M *= duck[:, None]
F *= (1 - 0.25 * np.clip(g, 0, 1))[:, None]

mix = M * 0.9 + F * 1.0
mix[:, 0] += vo * 1.0; mix[:, 1] += vo * 1.0
# fade
fi = int(0.05 * SR); fo = int((1.6 if DUR > 30 else 0.5) * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]; mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
pk = np.max(np.abs(mix)); mix = np.tanh(mix / max(pk, 1e-6) * 1.15) / np.tanh(1.15) * 0.93
with wave.open(out_path, 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok', out_path, 'peak', round(float(pk), 3))
