# موسيقى إعلان وزن (60 ثانية): مقدمة قاتمة، drop قوي لحظة الشعار، ومؤثرات مربوطة بكل حركة، ومزج تحت الصوت.
# python3 -I music.py <out.wav> <voice.mp3>
import sys, wave, subprocess
import numpy as np

SR = 44100
DUR = 61.0
N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(11)
M = np.zeros((N, 2))   # موسيقى
F = np.zeros((N, 2))   # مؤثرات


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
def saw(f, n, ph=0.0):
    p = (tarr(n) * f + ph) % 1.0
    return 2 * p - 1
def noise(n): return rng.standard_normal(n)

# ── الشبكة: 120 BPM، الـ drop على 5.85 بالضبط
BEAT = 0.5; BAR = 2.0; T0 = 4.95
def beats(a, b, step=BEAT, off=0.0):
    k0 = int(np.ceil((a - T0 - off) / step)); out = []
    while True:
        t = T0 + off + k0 * step
        if t >= b: break
        if t >= a: out.append(t)
        k0 += 1
    return out

# ── الآلات
def kick(g=1.0):
    n = int(0.42 * SR); t = tarr(n)
    f = 46 + 110 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = filt(noise(n), lo=2500) * np.exp(-t * 300) * 0.4
    return (body + click) * g
def clap():
    n = int(0.25 * SR); t = tarr(n)
    e = np.exp(-t * 26) + 0.6 * np.exp(-np.maximum(t - 0.012, 0) * 30) * (t > 0.012) + 0.5 * np.exp(-np.maximum(t - 0.024, 0) * 30) * (t > 0.024)
    return filt(noise(n), lo=900, hi=6000) * e
def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR); t = tarr(n)
    return filt(noise(n), lo=7500) * np.exp(-t * (14 if open_ else 70))
def snare():
    n = int(0.2 * SR); t = tarr(n)
    return filt(noise(n), lo=1200, hi=8000) * np.exp(-t * 22) + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
def crash(d=2.6):
    n = int(d * SR); t = tarr(n)
    return filt(noise(n), lo=3500) * np.exp(-t * 1.7) * (1 + 0.3 * np.sin(2 * np.pi * 6 * t))

prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
def chord_bar(ch, n, cutoff, bright=1.0):
    s = np.zeros(n)
    for m in ch:
        for d in (-0.11, -0.05, 0, 0.05, 0.11):
            s += saw(note(m) * 2 ** (d / 12), n, rng.random())
            s += 0.5 * saw(note(m + 12) * 2 ** (d / 12), n, rng.random()) * bright
    return filt(s / 18, hi=cutoff)

def pump(n, start):
    t = (start + tarr(n) - T0) % BEAT
    return 1 - 0.72 * np.exp(-t / 0.11)

def section_music(a, b, cutoff=4200, drums=True, arp=True, bright=1.0, gain=1.0, half=False):
    t = a
    k = int(round((a - T0) / BAR)) % 4
    while t < b - 1e-6:
        ln = min(BAR, b - t); n = int(ln * SR)
        ch = prog[k % 4]
        pad = chord_bar(ch, n, cutoff, bright) * env(n, 0.02, 0.06) * pump(n, t)
        add(M, pad, t, 0.55 * gain, -0.35); add(M, pad, t + 0.011, 0.55 * gain, 0.35)
        # باص: أثمان مع أوكتاف
        for j in range(8 if not half else 4):
            st = BEAT / 2 if not half else BEAT
            bt = t + j * st
            if bt >= b: break
            nn = int(st * 0.95 * SR); tt = tarr(nn)
            f = note(ch[0] - 24 + (12 if (j % 2 and not half) else 0))
            bs = filt(saw(f, nn), hi=520) * 0.8 + np.sin(2 * np.pi * f * tt) * 0.7
            add(M, bs * env(nn, 0.004, 0.05) * pump(nn, bt), bt, 0.62 * gain)
        if arp:
            for j in range(16):
                at = t + j * BEAT / 4
                if at >= b: break
                m = ch[[0, 1, 2, 1, 2, 0, 2, 1][j % 8]] + 24
                nn = int(0.22 * SR); tt = tarr(nn)
                s = (np.sin(2 * np.pi * note(m) * tt) + 0.35 * np.sign(np.sin(2 * np.pi * note(m) * tt))) * np.exp(-tt * 16)
                add(M, s, at, 0.12 * gain, -0.6 + (j % 8) * 0.17)
        if drums:
            for j in range(4):
                bt = t + j * BEAT
                if bt >= b: break
                if not half or j % 2 == 0: add(M, kick(), bt, 1.0 * gain)
                add(M, hat(True), bt + BEAT / 2, 0.20 * gain, 0.25)
                for q in (0.125, 0.375):
                    add(M, hat(), bt + q, 0.10 * gain, -0.25)
                if j in (1, 3): add(M, clap(), bt, 0.42 * gain, -0.05)
        t += BAR; k += 1

def snare_roll(a, b, g=0.5):
    t = a; i = 0
    while t < b:
        x = (t - a) / (b - a)
        add(M, snare(), t, g * (0.25 + 0.75 * x), (-1) ** i * 0.15)
        t += 0.125 if x < 0.5 else 0.0625; i += 1

# ── المقدمة المتوترة (0 → 3.73): درون + نبض سريع + تكتكة
n = int(3.9 * SR); t = tarr(n)
drone = (np.sin(2 * np.pi * 41.2 * t) * 0.8 + filt(saw(55, n) + saw(58.3, n), hi=300) * 0.5) * env(n, 0.4, 0.05)
drone *= 0.6 + 0.4 * np.sin(2 * np.pi * 2.0 * t) ** 2
add(M, drone, 0.0, 0.6)
for k_ in range(14):
    at = 0.1 + k_ * 0.27
    if at > 3.6: break
    nn = int(0.3 * SR); tt = tarr(nn)
    add(M, np.sin(2 * np.pi * (48 + 30 * np.exp(-tt * 20)) * tt) * np.exp(-tt * 12), at, 0.55 + 0.03 * k_)
n = int(1.4 * SR); t = tarr(n); x = t / t[-1]
add(F, filt(noise(n), lo=600, hi=7000) * x ** 2 * 0.7 + np.sin(2 * np.pi * np.cumsum(180 + 900 * x ** 2) / SR) * x * 0.25, 2.33, 0.5)
# «خلص.» قطع حاد، سكون، riser لوزن
n = int(1.2 * SR); t = tarr(n); x = t / t[-1]
add(F, filt(noise(n), lo=800, hi=9000) * x ** 2 * 0.5 + np.sin(2 * np.pi * np.cumsum(220 + 1200 * x ** 2) / SR) * x * 0.2, 3.75, 0.45)
cc = crash(1.0)[::-1]; add(F, cc * np.linspace(0, 1, len(cc)) ** 2, 4.95 - 1.0, 0.55)
# باص 808 تحت كل الموسيقى
def sub808(at, g=1.0):
    nn = int(0.55 * SR); tt = tarr(nn)
    f = 46 + 60 * np.exp(-tt * 30)
    add(M, np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * 2.2) * np.exp(-tt * 4.5), at, 0.55 * g)
section_music(4.95, 33.0, cutoff=4600)
for bt in np.arange(4.95, 33.0, 2.0): sub808(bt); sub808(bt + 0.75, 0.7); sub808(bt + 1.5, 0.8)
for a_, b_ in [(10.0, 10.55), (15.4, 15.95), (21.3, 21.8), (27.7, 28.2)]: snare_roll(a_, b_, 0.32)
section_music(33.0, 39.1, cutoff=2600, arp=False, gain=0.85, half=True)
snare_roll(38.4, 39.16, 0.5)
section_music(39.16, 46.6, cutoff=5000, gain=1.0)
for bt in np.arange(39.16, 46.6, 2.0): sub808(bt); sub808(bt + 0.75, 0.7); sub808(bt + 1.5, 0.8)
snare_roll(45.8, 46.73, 0.55)
section_music(46.73, 49.2, cutoff=6500, arp=False, bright=1.3, half=True, gain=1.05)
section_music(49.2, 59.7, cutoff=2400, arp=False, gain=0.8)
n = int(1.4 * SR)
fin = chord_bar([57, 64, 69, 72], n, 3000, 1.2) * np.exp(-tarr(n) * 1.6)
add(M, fin, 59.7, 0.7, -0.2); add(M, fin, 59.71, 0.7, 0.2)
sub808(59.7, 1.2)

fade = np.ones(N); fi = int(0.05 * SR); fo0 = int(60.4 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[fo0:] = np.linspace(1, 0, N - fo0)
M *= fade[:, None]

# ── المؤثرات
def whoosh(at, g=1.0, dur=0.55):
    n = int(dur * SR); t = tarr(n); x = t / t[-1]
    lo = filt(noise(n), lo=300, hi=1500); hi = filt(noise(n), lo=1500, hi=7000)
    w = (lo * (1 - x) + hi * x) * np.sin(np.pi * x) ** 2
    add(F, w, at - dur * 0.55, 0.32 * g, rng.uniform(-0.3, 0.3))
def impact(at, g=1.0, big=False):
    n = int((1.6 if big else 0.8) * SR); t = tarr(n)
    boom = np.sin(2 * np.pi * np.cumsum(32 + 110 * np.exp(-t * 14)) / SR) * np.exp(-t * (2.4 if big else 5))
    snap = filt(noise(n), lo=1200) * np.exp(-t * 28)
    add(F, boom * 1.0 + snap * 0.45, at, 0.6 * g)
    if big: add(F, crash(2.8), at, 0.35 * g)
def pop(at, g=1.0):
    n = int(0.14 * SR); t = tarr(n)
    add(F, np.sin(2 * np.pi * np.cumsum(300 + 1100 * np.exp(-t * 35)) / SR) * np.exp(-t * 26), at, 0.28 * g, rng.uniform(-0.4, 0.4))
def tick(at, g=1.0):
    n = int(0.022 * SR); t = tarr(n)
    add(F, np.sin(2 * np.pi * 3400 * t) * np.exp(-t * 320), at, 0.13 * g)
def beep(at, f=2600, d=0.12, g=1.0):
    n = int(d * SR); t = tarr(n)
    add(F, np.sign(np.sin(2 * np.pi * f * t)) * 0.4 * env(n, 0.003, 0.02), at, 0.18 * g)
def glitch(at, d=0.45, g=1.0):
    n = int(d * SR); t = tarr(n)
    s = np.sign(np.sin(2 * np.pi * (180 + 900 * rng.random()) * t)) * 0.4 + filt(noise(n), lo=2000) * 0.5
    gate = (np.floor(t * 34) % 2 == 0).astype(float) * np.exp(-t * 3)
    add(F, s * gate, at, 0.22 * g)
def printer(at, d):
    n = int(d * SR); t = tarr(n)
    buzz = filt(noise(n), lo=900, hi=5000) * (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 11 * t)))
    add(F, (buzz + np.sin(2 * np.pi * 170 * t) * 0.3) * env(n, 0.04, 0.12), at, 0.2)
def chime(at, g=1.0):
    for i, f in enumerate([1568, 2093, 2637]):
        n = int(1.2 * SR); t = tarr(n)
        add(F, (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 4), at + i * 0.07, 0.08 * g)
def notif(at):
    for i, f in enumerate([988, 1319]):
        n = int(0.5 * SR); t = tarr(n)
        add(F, np.sin(2 * np.pi * f * t) * np.exp(-t * 9), at + i * 0.09, 0.16)
def stamp(at):
    n = int(0.45 * SR); t = tarr(n)
    add(F, np.sin(2 * np.pi * (60 + 70 * np.exp(-t * 30)) * t) * np.exp(-t * 11) + filt(noise(n), lo=500, hi=3000) * np.exp(-t * 35) * 0.6, at, 0.65)
def coin(at):
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        n = int(0.9 * SR); t = tarr(n)
        add(F, np.sin(2 * np.pi * f * t) * np.exp(-t * (6 + i)), at + i * 0.025, 0.07)
def click(at, g=1.0):
    n = int(0.06 * SR); t = tarr(n)
    add(F, filt(noise(n), lo=2000, hi=9000) * np.exp(-t * 200) + np.sin(2 * np.pi * 1300 * t) * np.exp(-t * 260) * 0.6, at, 0.45 * g)
def scan(a, b):
    n = int((b - a) * SR); t = tarr(n); x = t / t[-1]
    add(F, np.sin(2 * np.pi * np.cumsum(900 + 700 * np.sin(np.pi * x)) / SR) * 0.3 * np.sin(np.pi * x), a, 0.12)
def rustle(a, b):
    n = int((b - a) * SR); t = tarr(n)
    s = filt(noise(n), lo=1500, hi=6000) * (0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 3.1 * t) * np.sin(2 * np.pi * 1.3 * t)))
    add(F, s * env(n, 0.2, 0.3), a, 0.09)
def implode(a, b):
    n = int((b - a) * SR); t = tarr(n); x = t / t[-1]
    s = filt(noise(n), lo=200, hi=6000) * x ** 3 + np.sin(2 * np.pi * np.cumsum(900 - 820 * x) / SR) * x ** 2 * 0.4
    add(F, s, a, 0.5)
def shimmer(at, g=1.0):
    for i in range(14):
        f = 1800 + rng.random() * 3600; n = int(0.5 * SR); t = tarr(n)
        add(F, np.sin(2 * np.pi * f * t) * np.exp(-t * 7), at + i * 0.035, 0.035 * g, rng.uniform(-0.8, 0.8))

# المقدمة
rustle(0.0, 3.7)
for i in range(9): beep(1.0 + i / 3.6, f=1900 + 200 * (i % 3), d=0.06, g=0.6)
beep(3.2, f=330, d=0.28, g=1.1)
[tick(0.1 + 0.27 * i, 0.8) for i in range(13)]
impact(0.88, 0.6); impact(1.82, 0.5); impact(2.62, 0.7); impact(3.06, 0.9)
glitch(3.73, 0.5, 1.3); impact(3.73, 1.0)
implode(3.85, 4.3)
impact(4.95, 1.7, big=True); shimmer(5.0, 1.4)
# الجوال
whoosh(5.75, 1.0)
for at, _ in [(6.72, 0), (11.4, 0), (12.4, 0), (17.18, 0), (29.1, 0), (31.86, 0)]: click(at, 1.3); whoosh(at + 0.05, 0.4, 0.3)
for at in [10.55, 15.95, 21.8, 28.2, 33.0, 39.0, 46.55, 49.15]: whoosh(at, 0.9)
whoosh(7.3, 0.6, 0.35); scan(7.62, 8.1); beep(8.08, f=2800, d=0.11, g=1.1)
whoosh(8.1, 0.5, 0.35); pop(8.6, 0.6); pop(8.85, 0.6)
stamp(9.68); chime(9.73, 0.9)
pop(14.29, 0.7); pop(15.06, 0.7)
pop(19.0, 0.6); pop(19.42, 0.6); notif(20.6)
for at in [24.0, 24.66, 25.51]: whoosh(at - 0.1, 0.5, 0.35); pop(at, 0.6)
for i in range(26): tick(24.0 + i * 0.08, 0.5)
impact(25.51, 0.6); shimmer(25.55, 0.6)
coin(26.36); coin(27.03)
pop(29.5, 0.7); notif(31.4)
# بدون نت
glitch(34.14, 0.3, 0.9); click(35.84, 1.3); impact(35.9, 0.5)
whoosh(36.83, 0.8); whoosh(37.76, 0.9); impact(38.25, 0.5)
# المجالات
for at in [39.16, 40.08, 40.65, 41.43]: impact(at, 0.75)
for i in range(16): pop(42.4 + i * 0.05, 0.5)
for i in range(18): tick(42.4 + i * 0.066)
impact(43.6, 0.8); chime(43.65, 0.8)
for at in [44.4, 44.6, 45.12]: whoosh(at, 0.5, 0.35)
impact(46.73, 1.6, big=True); shimmer(46.78, 1.5)
pop(49.25, 0.9); notif(50.0)
for a_, _ in [(51.37, 0), (52.74, 0), (53.95, 0), (55.98, 0), (57.38, 0), (58.68, 0)]: pop(a_ - 0.04, 0.5)
impact(59.7, 0.9, big=True); shimmer(59.75, 0.8)

# ── المزج
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
active = np.clip((envv - 0.012) / 0.03, 0, 1)
kk = int(0.22 * SR); active = np.convolve(active, np.ones(kk) / kk, mode='same')
duck = 1 - 0.5 * active
tt = tarr(N)
duck *= np.where((tt > 51.2) & (tt < 59.7), 0.75, 1.0)
M *= duck[:, None]
F *= (1 - 0.25 * active)[:, None]
M = M / np.max(np.abs(M)) * 0.32
F = F / np.max(np.abs(F)) * 0.5
mix = M + F + np.stack([vo, vo], axis=1) * 1.0
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', out_path)
