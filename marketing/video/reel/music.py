# موسيقى هادئة ومؤثرات للفيديو التعليمي (نقرات، كتابة، ماسح، نجاح) — مولّدة بالكامل.
import sys, wave, subprocess
import numpy as np

SR = 44100
DUR = 37.0
N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(11)
M = np.zeros((N, 2))  # الموسيقى
F = np.zeros((N, 2))  # المؤثرات

def t_arr(n): return np.arange(n) / SR
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
    if i >= N or i < 0: return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def tri(f, n):
    ph = (t_arr(n) * f) % 1.0
    return 4 * np.abs(ph - 0.5) - 1

# ── موسيقى: وسادة دافئة + أربيجيو ناعم (C - G - Am - F) بإيقاع 96
prog = [[48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]]
bar = 2.0
k = 0; t0 = 0.0
while t0 < DUR - 0.5:
    ch = prog[k % 4]; n = int(min(bar + 0.8, DUR - t0) * SR)
    pad = sum(tri(note(m), n) for m in ch) / len(ch)
    pad = filt(pad, hi=1100) * env(n, 0.8, 0.8)
    add(M, pad, t0, 0.5, -0.3); add(M, pad, t0 + 0.01, 0.5, 0.3)
    # أربيجيو
    for j in range(8):
        m = ch[[2, 3, 4, 3, 2, 4, 3, 4][j]] + 12
        nn = int(0.6 * SR); tt = t_arr(nn)
        s = (np.sin(2 * np.pi * note(m) * tt) + 0.3 * np.sin(4 * np.pi * note(m) * tt)) * np.exp(-tt * 6)
        add(M, s, t0 + j * bar / 8, 0.22, -0.4 + 0.1 * j)
    # نبض باص خفيف
    for j in range(4):
        nn = int(0.5 * SR); tt = t_arr(nn)
        b = np.sin(2 * np.pi * note(ch[0] - 12) * tt) * np.exp(-tt * 5)
        add(M, b, t0 + j * bar / 4, 0.35)
    t0 += bar; k += 1
fade = np.ones(N); fi = int(1.5 * SR); fo = int(3 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
M *= fade[:, None]

# ── مؤثرات
def click(at):
    n = int(0.05 * SR); t = t_arr(n)
    c = filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-t * 180) + np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 300) * 0.4
    add(F, c, at, 0.5)
def typing(at, dur):
    tt = at
    while tt < at + dur:
        n = int(0.035 * SR); t = t_arr(n)
        k = filt(rng.standard_normal(n), lo=1800, hi=7000) * np.exp(-t * 220)
        add(F, k, tt, 0.18 + 0.08 * rng.random(), rng.uniform(-0.3, 0.3))
        tt += 0.07 + 0.05 * rng.random()
def beep(at):
    n = int(0.16 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * 2700 * t) * env(n, 0.005, 0.03), at, 0.18)
def chime(at):
    for i, m in enumerate([76, 79, 84]):
        n = int(0.9 * SR); t = t_arr(n)
        s = (np.sin(2 * np.pi * note(m) * t) + 0.25 * np.sin(4 * np.pi * note(m) * t)) * np.exp(-t * 5)
        add(F, s, at + i * 0.07, 0.16)
def whoosh(at, g=1.0, dur=0.7):
    n = int(dur * SR); t = t_arr(n)
    w = filt(rng.standard_normal(n), lo=300, hi=3500) * np.sin(np.pi * t / t[-1]) ** 2
    add(F, w, at - dur / 2, 0.22 * g)
def pop(at):
    n = int(0.18 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * (300 + 900 * np.exp(-t * 30)) * t) * np.exp(-t * 22), at, 0.22)
def ding(at):
    n = int(1.4 * SR); t = t_arr(n)
    s = (np.sin(2 * np.pi * 1320 * t) + 0.5 * np.sin(2 * np.pi * 1980 * t)) * np.exp(-t * 3)
    add(F, s, at, 0.12); add(F, s, at + 0.25, 0.08)

for at in [2.3, 6.55, 12.0, 16.36, 19.1, 23.65, 27.55, 30.0]:
    whoosh(at)
for at in [0.3, 4.55, 7.4, 9.6, 12.7, 16.9, 18.0, 19.12, 19.97, 20.8, 21.9, 23.8, 24.4, 25.0, 25.6, 26.35, 28.5, 28.72, 28.94, 32.75, 33.5]:
    pop(at)
click(1.2); click(1.32)
for at in [15.2, 30.8]:
    chime(at)
ding(2.35)

# ── المزج: خفض الموسيقى أثناء الكلام
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
active = np.clip((envv - 0.01) / 0.03, 0, 1)
k = int(0.3 * SR); active = np.convolve(active, np.ones(k) / k, mode='same')
M *= (1 - 0.5 * active)[:, None]
M = M / np.max(np.abs(M)) * 0.22
F = F / np.max(np.abs(F)) * 0.5
mix = M + F + np.stack([vo, vo], axis=1)
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
if len(sys.argv) > 3:
    for name, buf in (('music', M), ('fx', F)):
        p = (np.clip(buf, -1, 1) * 32767).astype(np.int16)
        with wave.open(sys.argv[3] + f'_{name}.wav', 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(p.tobytes())
print('ok')
