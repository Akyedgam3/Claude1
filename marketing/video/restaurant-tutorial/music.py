# موسيقى هادية لفيديو الشرح + كبسات الماوس والكتابة والإشعارات، وبتنخفض تحت الصوت.
import sys, wave, subprocess
import numpy as np
SR = 44100; DUR = 362.0; N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(5)
M = np.zeros((N, 2)); F = np.zeros((N, 2))
ta = lambda n: np.arange(n) / SR
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))
def add(buf, sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i < 0: return
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
note = lambda m: 440 * 2 ** ((m - 69) / 12)
def tri(f, n): ph = (ta(n) * f) % 1.0; return 4 * np.abs(ph - 0.5) - 1
BEAT = 60 / 92; BAR = 4 * BEAT
prog = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]
t0 = 0.0; k = 0
while t0 < DUR:
    ch = prog[k % 4]; n = int(BAR * SR)
    pad = sum(tri(note(m), n) + tri(note(m) * 1.003, n) for m in ch) / 8
    pad = filt(pad, hi=1100) * np.minimum(1, np.minimum(ta(n) / 0.4, (BAR - ta(n)) / 0.4))
    add(M, pad, t0, 0.35, -0.3); add(M, pad, t0 + 0.015, 0.35, 0.3)
    for j in range(8):
        m = ch[[0, 2, 1, 3, 2, 1, 3, 2][j]] + 12; nn = int(0.5 * SR); tt = ta(nn)
        s = (np.sin(2 * np.pi * note(m) * tt) + 0.3 * np.sin(4 * np.pi * note(m) * tt)) * np.exp(-tt * 6)
        add(M, s, t0 + j * BEAT / 2, 0.12, -0.5 + j * 0.13)
    if 6 < t0 < 356:
        for j in range(4):
            nn = int(0.25 * SR); tt = ta(nn)
            add(M, np.sin(2 * np.pi * (50 + 80 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 12), t0 + j * BEAT, 0.35)
            hn = int(0.04 * SR); add(M, filt(rng.standard_normal(hn), lo=8000) * np.exp(-ta(hn) * 70), t0 + j * BEAT + BEAT / 2, 0.08, 0.3)
    nb = int(BAR * SR); tb = ta(nb)
    add(M, np.sin(2 * np.pi * note(ch[0] - 24) * tb) * np.exp(-tb * 1.2), t0, 0.3)
    t0 += BAR; k += 1
fade = np.ones(N); fade[:int(1.0 * SR)] = np.linspace(0, 1, int(1.0 * SR)); a = int(358.5 * SR); fade[a:] = np.linspace(1, 0, N - a)
M *= fade[:, None]

def click(at):
    n = int(0.05 * SR); tt = ta(n)
    add(F, filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-tt * 170) + np.sin(2 * np.pi * 2000 * tt) * np.exp(-tt * 260) * 0.5, at, 0.5)
def whoosh(at, g=1.0, d=0.5):
    n = int(d * SR); tt = ta(n)
    add(F, filt(rng.standard_normal(n), lo=400, hi=4000) * np.sin(np.pi * tt / tt[-1]) ** 2, at - d * 0.6, 0.18 * g)
def pop(at, g=1.0):
    n = int(0.14 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * (380 + 900 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 22), at, 0.16 * g)
def key(at):
    n = int(0.03 * SR); tt = ta(n); add(F, filt(rng.standard_normal(n), lo=1800, hi=8000) * np.exp(-tt * 230), at, 0.22 + 0.08 * rng.random(), rng.uniform(-0.3, 0.3))
def typing(a, d, c):
    for i in range(c): key(a + d * i / c + rng.uniform(-0.01, 0.01))
def ding(at, g=1.0):
    n = int(1.2 * SR); tt = ta(n)
    s = (np.sin(2 * np.pi * 1320 * tt) + 0.5 * np.sin(2 * np.pi * 1980 * tt)) * np.exp(-tt * 3.5)
    add(F, s, at, 0.12 * g); add(F, s, at + 0.15, 0.07 * g)
def msg(at):
    for i, f in enumerate([1568, 2093]):
        n = int(0.25 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 14), at + i * 0.07, 0.09)
def chime(at):
    for i, f in enumerate([1047, 1319, 1568, 2093]):
        n = int(1.0 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 4), at + i * 0.08, 0.08)

def printer(a, d):
    n = int(d * SR); tt = ta(n)
    buzz = filt(rng.standard_normal(n), lo=600, hi=3500) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 14 * tt)))
    env = np.minimum(1, np.minimum(tt / 0.1, (d - tt) / 0.2))
    add(F, buzz * env, a, 0.10)

for c in [30.1, 42.1, 53.6, 65.2, 125.4, 133.4, 156.3, 201.6, 219.6, 225.6, 249.0, 259.4, 270.4]: click(c)
for s in [19.0, 81.0, 117.9, 176.8, 215.3, 238.3, 264.0, 302.0, 332.0, 343.0]: whoosh(s, 1.2, 0.7)
for p in [208.1, 299.0, 332.6, 333.8, 335.0, 336.2]: pop(p)
printer(271.0, 4.2); printer(292.0, 7.0)
typing(347.3, 2.4, 14); typing(353.2, 2.4, 14)
ding(19.3); chime(343.3)

raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR); envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
act = np.clip((envv - 0.01) / 0.03, 0, 1); kk = int(0.3 * SR); act = np.convolve(act, np.ones(kk) / kk, mode='same')
M *= (1 - 0.6 * act)[:, None]
M = M / np.max(np.abs(M)) * 0.2
F = F / np.max(np.abs(F)) * 0.32
vo = vo / np.max(np.abs(vo)) * 0.7
mix = M + F + np.stack([vo, vo], axis=1)
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print('ok')
