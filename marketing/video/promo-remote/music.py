# موسيقى تريلر سينمائي للاتصال عن بعد: تيك تاك ونبض، ضربات بيس، «برام»، طبول تايكو، ورايزرات. مولّدة بالكامل.
# python3 -I music.py <events.json> <out.wav>
import sys, wave, json
import numpy as np
ev = json.load(open(sys.argv[1])); out_path = sys.argv[2]
SR = 44100; DUR = ev['duration']; N = int(SR * DUR)
rng = np.random.default_rng(21)
M = np.zeros((N, 2))
def T(n): return np.arange(n) / SR
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))
def env(n, a, d):
    e = np.ones(n); na = min(n, max(1, int(a * SR))); nd = min(n, max(1, int(d * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nd:] *= np.linspace(1, 0, nd); return e
def add(sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    M[i:i + len(sig), 0] += sig * g * l; M[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def saw(f, t): return ((t * f) % 1.0) * 2 - 1
def sweep_lp(x, f0, f1):
    # فلتر بيفتح مع الوقت: منقسم لقطع
    out = np.zeros_like(x); k = 12; L = len(x) // k + 1
    for j in range(k):
        a, b = j * L, min(len(x), (j + 1) * L)
        if a >= b: break
        seg = x[a:b]; out[a:b] = filt(np.pad(seg, (2000, 2000)), hi=f0 + (f1 - f0) * (j / k))[2000:2000 + len(seg)]
    return out

def boom(at, g=1.0):
    n = int(2.2 * SR); t = T(n)
    f = 28 + 90 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crack = filt(rng.standard_normal(n), lo=80, hi=4000) * np.exp(-t * 9)
    metal = sum(np.sin(2 * np.pi * fr * t) for fr in (173, 241, 389, 577)) * np.exp(-t * 4) * 0.12
    s = np.tanh((sub * 1.6 + crack * 0.7 + metal) * 1.4)
    add(s, at, 0.95 * g)
def braam(at, root=36, dur=2.4, g=1.0):
    n = int(dur * SR); t = T(n)
    x = sum(saw(note(m) * (1 + d), t) for m in (root, root + 7, root + 12, root + 15) for d in (-0.006, 0, 0.006)) / 12
    x = sweep_lp(x, 200, 2600) * env(n, 0.03, dur * 0.7)
    add(np.tanh(x * 2.5) * 0.9, at, 0.55 * g, -0.2); add(np.tanh(x * 2.5) * 0.9, at + 0.02, 0.55 * g, 0.2)
def riser(end, dur=1.6, g=1.0):
    n = int(dur * SR); t = T(n); k = t / dur
    noise = filt(rng.standard_normal(n), lo=400, hi=9000) * k ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1800 * k ** 2) / SR) * k ** 3 * 0.25
    add((noise * 0.6 + tone), end - dur, 0.4 * g)
def tick(at, hi=True):
    n = int(0.05 * SR); add(filt(rng.standard_normal(n), lo=2500 if hi else 1200, hi=9000) * np.exp(-T(n) * 140), at, 0.4)
def heart(at):
    for d, gg in ((0, 1.0), (0.22, 0.7)):
        n = int(0.4 * SR); t = T(n); add(np.sin(2 * np.pi * (48 + 30 * np.exp(-t * 25)) * t) * np.exp(-t * 10), at + d, 0.55 * gg)
def taiko(at, g=1.0):
    n = int(0.7 * SR); t = T(n)
    s = np.sin(2 * np.pi * np.cumsum(70 + 80 * np.exp(-t * 20)) / SR) * np.exp(-t * 6) + filt(rng.standard_normal(n), hi=1500) * np.exp(-t * 25) * 0.4
    add(s, at, 0.5 * g)
def snare(at, g=1.0):
    n = int(0.3 * SR); t = T(n); add((filt(rng.standard_normal(n), lo=700, hi=7000) * np.exp(-t * 16) + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.5), at, 0.35 * g)
def hat(at, g=1.0):
    n = int(0.04 * SR); add(filt(rng.standard_normal(n), lo=7000) * np.exp(-T(n) * 100), at, 0.08 * g, 0.4)
def ding(at):
    for j, m in enumerate([88, 95]):
        n = int(0.9 * SR); t = T(n); add((np.sin(2 * np.pi * note(m) * t) + 0.3 * np.sin(4 * np.pi * note(m) * t)) * np.exp(-t * 5), at + j * 0.09, 0.22)
def reverse_cym(end, dur=1.3):
    n = int(dur * SR); t = T(n); c = filt(rng.standard_normal(n), lo=3000) * np.exp(-(dur - t) * 4)
    add(c, end - dur, 0.25)

HITS = ev['hits']; CUTS = ev['cuts']
# ── 0..1.9: تيك تاك ونبض ودرون
n = int(10.2 * SR); t = T(n)
drone = (np.sin(2 * np.pi * note(24) * t) + 0.5 * np.sin(2 * np.pi * note(31) * t * 1.003)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * t))
add(filt(drone, hi=300) * env(n, 0.5, 1.5), 0, 0.35)
x = 0.0
while x < 6.4: tick(x, int(x * 2) % 2 == 0); x += 0.5
for h in (0.2, 1.1, 2.6, 3.6, 5.0): heart(h)
# ── الضربات الكبيرة
for i, h in enumerate(HITS):
    boom(h, 1.2 if h in (6.6, 27.0) else 1.0)
    if h in (1.9, 4.1, 6.6, 16.0, 24.0, 27.0): braam(h, 36 if i % 2 == 0 else 33, 2.6 if h != 27.0 else 4.2, 1.2 if h in (6.6, 27.0) else 1.0)
    riser(h, 1.2 if h != 6.6 else 2.4, 0.8 if h != 6.6 else 1.3)
# ── 10.2..19.6: أوستيناتو بيس ٦/١٦ وطبول تايكو بتكبر
BPM = 128; b = 60 / BPM
x = 10.2; k = 0
seq = [33, 33, 45, 33, 33, 43, 33, 40]
while x < 19.5:
    m = seq[k % len(seq)]; nn = int(b / 2 * SR); tt = T(nn)
    s = np.tanh(saw(note(m), tt) * 2) * np.exp(-tt * 8)
    add(filt(s, hi=900 + 600 * (x - 10.2) / 9), x, 0.22)
    if k % 2 == 0: hat(x + b / 4, 0.8)
    if k % 4 == 0: taiko(x, 0.7 + 0.5 * (x - 10.2) / 9)
    if k % 8 == 6 and x > 13: taiko(x, 0.6); taiko(x + b / 4, 0.5)
    x += b / 2; k += 1
ding(ev['sold'] + 0.55)
# ── 19.6..24: مونتاج سريع، طبول كاملة مع كل قطعة
riser(20.0, 1.0, 1.0)
x = 20.0; k = 0
while x < 23.95:
    taiko(x, 1.0)
    if k % 2 == 1: snare(x, 1.0)
    hat(x + b / 4); hat(x + 3 * b / 4, 0.6)
    x += b / 2; k += 1
for c in CUTS: snare(c, 1.3); boom(c, 0.45)
for a in (24.3, 24.65, 25.0): taiko(a, 0.9)
# ── 26.4..27: سكتة وسيمبال معكوس، وبعدين الضربة الأخيرة وكورد طويل
reverse_cym(27.0, 1.4)
boom(27.75, 0.9)
n = int(4.0 * SR); t = T(n)
chord = sum(np.sin(2 * np.pi * note(m) * t) for m in (45, 52, 57, 60, 64)) / 5
add(filt(chord, hi=1800) * env(n, 0.2, 2.5), 27.0, 0.35)

mix = M / np.max(np.abs(M)) * 0.95
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
fo = int(1.0 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', DUR)
