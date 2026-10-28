# موسيقى إعلان الأنميشن (إيقاع حديث 120 BPM) ومؤثرات الانتقالات، مولّدة بالكامل.
# python3 -I music.py <events.json> <out.wav>
import sys, wave, json
import numpy as np
ev = json.load(open(sys.argv[1])); out_path = sys.argv[2]
SR = 44100; DUR = ev['duration']; N = int(SR * DUR)
rng = np.random.default_rng(5)
M = np.zeros((N, 2)); F = np.zeros((N, 2))
def T(n): return np.arange(n) / SR
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))
def env(n, a, d):
    e = np.ones(n); na = min(n, max(1, int(a * SR))); nd = min(n, max(1, int(d * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nd:] *= np.linspace(1, 0, nd); return e
def add(buf, sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def saw(f, n, det=0.0):
    t = T(n); return sum(((t * f * (1 + d)) % 1.0) * 2 - 1 for d in (-det, 0, det)) / 3

BPM = 120; beat = 60 / BPM; bar = beat * 4
# Am – F – C – G بنمط عصري
PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]
start = 2.0  # الإيقاع بيبلّش بعد المقدمة
# باد خفيف من الأول
k = 0; t0 = 0.0
while t0 < DUR - 0.5:
    ch = PROG[k % 4]; n = int(min(bar + 0.6, DUR - t0) * SR)
    pad = sum(saw(note(m), n, 0.004) for m in ch) / 4
    pad = filt(pad, hi=1400 if t0 > start else 700) * env(n, 0.4, 0.6)
    add(M, pad, t0, 0.22, -0.4); add(M, pad, t0 + 0.015, 0.22, 0.4)
    # باص
    bn = int(bar * SR); bt = T(bn)
    bass = np.sin(2 * np.pi * note(ch[0] - 24) * bt) + 0.3 * np.sin(4 * np.pi * note(ch[0] - 24) * bt)
    if t0 >= start - 0.01: add(M, bass * env(bn, 0.02, 0.2), t0, 0.32)
    # أربيجيو بلَك بالتمانيات
    if t0 >= start - 0.01:
        for j in range(8):
            m = ch[[0, 2, 1, 3, 2, 1, 3, 2][j]] + 12
            nn = int(0.35 * SR); tt = T(nn)
            s = (np.sin(2 * np.pi * note(m) * tt) + 0.4 * np.sin(4 * np.pi * note(m) * tt)) * np.exp(-tt * 9)
            add(M, s, t0 + j * beat / 2, 0.14, -0.5 + j * 0.14)
    t0 += bar; k += 1
# درامز
def kick(at, g=1.0):
    n = int(0.35 * SR); t = T(n); f = 45 + 120 * np.exp(-t * 30)
    add(M, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7), at, 0.62 * g)
def clap(at):
    n = int(0.18 * SR); t = T(n); add(M, filt(rng.standard_normal(n), lo=900, hi=6000) * np.exp(-t * 22), at, 0.22)
def hat(at, g=1.0):
    n = int(0.05 * SR); add(M, filt(rng.standard_normal(n), lo=7000) * np.exp(-T(n) * 90), at, 0.07 * g, 0.3)
t = start; i = 0
while t < DUR - 2.6:
    quiet = 21.6 < t < 22.3
    if not quiet:
        kick(t, 1.0 if i % 4 in (0, 2) else 0.75)
        if i % 4 in (1, 3): clap(t)
        hat(t + beat / 2); hat(t + beat / 4, 0.5); hat(t + 3 * beat / 4, 0.5)
    t += beat; i += 1
fade = np.ones(N); fi = int(0.8 * SR); fo = int(2.4 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
M *= fade[:, None]

# ── مؤثرات
def whoosh(at, g=1.0, dur=0.9):
    n = int(dur * SR); t = T(n)
    w = filt(rng.standard_normal(n), lo=250, hi=5000) * np.sin(np.pi * t / t[-1]) ** 2
    add(F, w, at - dur * 0.6, 0.5 * g)
def riser(at, dur=1.2):
    n = int(dur * SR); t = T(n); f = 300 + 2400 * (t / dur) ** 2
    s = filt(rng.standard_normal(n), lo=600, hi=8000) * (t / dur) ** 2 * 0.6 + np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur) ** 3 * 0.15
    add(F, s, at - dur, 0.35)
def pop(at, g=1.0):
    n = int(0.16 * SR); t = T(n); add(F, np.sin(2 * np.pi * (380 + 900 * np.exp(-t * 35)) * t) * np.exp(-t * 24), at, 0.3 * g)
def chime(at):
    for j, m in enumerate([81, 84, 88, 93]):
        n = int(1.0 * SR); t = T(n); add(F, (np.sin(2 * np.pi * note(m) * t) + 0.25 * np.sin(4 * np.pi * note(m) * t)) * np.exp(-t * 4.5), at + j * 0.06, 0.16)
def beep(at):
    n = int(0.18 * SR); add(F, np.sin(2 * np.pi * 2900 * T(n)) * env(n, 0.004, 0.03), at, 0.22)
def tick(at):
    n = int(0.04 * SR); add(F, filt(rng.standard_normal(n), lo=2000, hi=9000) * np.exp(-T(n) * 120), at, 0.35)
def printer(at, dur=2.2):
    n = int(dur * SR); t = T(n)
    buzz = np.sign(np.sin(2 * np.pi * 95 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * t)); buzz = filt(buzz, lo=150, hi=2500) * env(n, 0.05, 0.2)
    add(F, buzz, at, 0.12)
def hit(at):
    n = int(1.6 * SR); t = T(n)
    s = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 8)) / SR) * np.exp(-t * 2.5) + filt(rng.standard_normal(n), hi=1800) * np.exp(-t * 6) * 0.4
    add(F, s, at, 0.5)
for c in ev['whoosh']: whoosh(c); riser(c, 1.0)
for c in ev['pop']: pop(c)
for c in ev['chime']: chime(c)
for c in ev['beep']: beep(c)
for c in ev['tick']: tick(c)
for c in ev['printer']: printer(c)
for c in ev['hit']: hit(c)

M = M / np.max(np.abs(M)) * 0.55
F = F / np.max(np.abs(F)) * 0.5
mix = M + F
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', DUR)
