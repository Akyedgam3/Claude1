# موسيقى هادية لفيديو شرح «الاتصال عن بعد»: باد ناعم + بلَك خفيف + نبض، بسلم ري الكبير، 151.5ث.
import wave, numpy as np
SR = 44100; DUR = 151.5; N = int(SR * DUR)
rng = np.random.default_rng(3)
M = np.zeros((N, 2))
BPM = 92; B = 60 / BPM
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
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    M[i:i + len(sig), 0] += sig * g * l; M[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def saw(f, t): return ((t * f) % 1.0) * 2 - 1
def pad(at, ms, dur, g=1.0):
    n = int(dur * SR); t = T(n)
    x = sum(saw(note(m) * (1 + d), t) for m in ms for d in (-0.003, 0.003)) / (2 * len(ms))
    add(filt(x, hi=1400) * env(n, 1.2, 1.5), at, 0.22 * g, -0.1)
def pluck(at, m, g=1.0, pan=0.0):
    n = int(0.9 * SR); t = T(n); f = note(m)
    x = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6))
    add(x * np.exp(-t * 4.5) * 0.6, at, 0.13 * g, pan)
def kick(at, g=1.0):
    n = int(0.35 * SR); t = T(n); f = 48 + 80 * np.exp(-t * 30)
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9), at, 0.35 * g)
def hat(at, g=1.0):
    n = int(0.04 * SR); add(filt(rng.standard_normal(n), lo=7000) * np.exp(-T(n) * 120), at, 0.04 * g, 0.3)
def chime(at, g=1.0):
    for j, m in enumerate([86, 93]):
        n = int(1.2 * SR); t = T(n); add(np.sin(2 * np.pi * note(m) * t) * np.exp(-t * 4), at + j * 0.08, 0.12 * g, 0.2)
# تسلسل: D - Bm - G - A (ري الكبير)
CH = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]]
ARP = [[62, 66, 69, 74], [59, 62, 66, 71], [55, 59, 62, 67], [57, 61, 64, 69]]
bar = 4 * B
t = 0.0; k = 0
while t < DUR - 1:
    c = k % 4
    pad(t, CH[c], bar + 1.5, 1.0)
    for j in range(8):
        pluck(t + j * B / 2, ARP[c][(j * 3) % 4] + (12 if j % 4 == 3 else 0), 0.9 if j % 2 == 0 else 0.6, pan=(-0.4 if j % 2 else 0.4))
    if 6 < t < DUR - 6:
        for j in range(4):
            kick(t + j * B, 0.8 if j % 2 == 0 else 0.5)
            hat(t + j * B + B / 2)
    t += bar; k += 1
for s in (16.8, 28.8, 52.2, 73.5, 89.8, 102.5, 110.5, 126.4, 137.6):
    chime(s)
fade = np.ones(N); nf = int(3 * SR); fade[-nf:] = np.linspace(1, 0, nf); fi = int(1.5 * SR); fade[:fi] = np.linspace(0, 1, fi)
M *= fade[:, None]
M = M / np.max(np.abs(M)) * 0.9
w = wave.open('music.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((M * 32767).astype('<i2').tobytes()); w.close()
print('ok')
