# موسيقى إعلان معيار (30 ثانية): بيت حماسي 120 BPM + مؤثرات على كل حركة. بدون صوت متكلم.
import sys, wave
import numpy as np
SR = 44100; DUR = 30.0; N = int(SR * DUR)
out_path = sys.argv[1]
rng = np.random.default_rng(7)
M = np.zeros((N, 2)); F = np.zeros((N, 2))
ta = lambda n: np.arange(n) / SR
note = lambda m: 440 * 2 ** ((m - 69) / 12)
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))
def add(buf, sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: N - i]; l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def saw(f, n): ph = (ta(n) * f) % 1.0; return 2 * ph - 1

B = 0.5  # 120 BPM
def kick(at, g=1.0):
    n = int(0.35 * SR); tt = ta(n); add(M, np.sin(2 * np.pi * (45 + 110 * np.exp(-tt * 28)) * tt) * np.exp(-tt * 7), at, 0.9 * g)
def snare(at, g=1.0):
    n = int(0.22 * SR); tt = ta(n)
    s = filt(rng.standard_normal(n), lo=1200, hi=9000) * np.exp(-tt * 18) * 0.7 + np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30) * 0.5
    add(M, s, at, 0.45 * g)
def hat(at, g=1.0):
    n = int(0.05 * SR); tt = ta(n); add(M, filt(rng.standard_normal(n), lo=7000) * np.exp(-tt * 80), at, 0.12 * g, 0.3)
def clap(at):
    for d in (0, 0.012, 0.024):
        n = int(0.12 * SR); tt = ta(n); add(M, filt(rng.standard_normal(n), lo=900, hi=6000) * np.exp(-tt * 30), at + d, 0.18)

prog = [57, 53, 60, 55]  # Am F C G
def chords(a, b, g=1.0, stab=False):
    t = a
    while t < b - 0.01:
        root = prog[int((t - a) / (4 * B)) % 4]
        ch = [root, root + (3 if root in (57,) else 4), root + 7]
        if stab:
            for k in range(8):
                if k in (0, 3, 6) or (k == 7):
                    n = int(0.22 * SR); tt = ta(n)
                    s = sum(saw(note(m + 12), n) for m in ch) / 3 * np.exp(-tt * 9)
                    add(M, filt(s, hi=4200), t + k * B / 2, 0.12 * g, -0.2 + 0.1 * (k % 3))
        n = int(4 * B * SR); tt = ta(n)
        pad = sum(saw(note(m), n) + saw(note(m) * 1.004, n) for m in ch) / 6
        pad = filt(pad, hi=1500) * np.minimum(1, np.minimum(tt / 0.08, (4 * B - tt) / 0.1))
        add(M, pad, t, 0.10 * g, -0.4); add(M, pad, t + 0.012, 0.10 * g, 0.4)
        nb = int(B * SR * 0.9)
        for k in range(8):
            tb = ta(nb // 2); add(M, np.tanh(2.2 * np.sin(2 * np.pi * note(root - 24) * tb)) * np.exp(-tb * 6), t + k * B / 2, 0.22 * g)
        t += 4 * B

# المقدمة (0–2.6): نبض خفيف
for k in range(5): hat(1.0 + k * B, 0.6)
chords(1.0, 2.6, 0.55)
# المشكلة (2.6–5.6): كيك وبيز متوتر
for k in range(6):
    kick(2.62 + k * B, 0.8)
    hat(2.62 + k * B + B / 2, 0.7)
chords(2.62, 5.6, 0.6)
# الجملة (5.6–8): رايزر + سنير رول
n = int(2.4 * SR); tt = ta(n)
rise = filt(rng.standard_normal(n), lo=300, hi=8000) * (tt / tt[-1]) ** 2
add(F, rise, 5.6, 0.22)
sw = np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / tt[-1]) ** 2) / SR) * (tt / tt[-1]) ** 1.5
add(M, sw, 5.6, 0.10)
for k in range(16): snare(7.2 + k * 0.05, 0.3 + 0.04 * k)
kick(5.6, 0.7); kick(6.6, 0.7)
# الدروب (8–21) والمجالات (21–24) والسعر (24–26.9)
t = 8.0
while t < 26.9 - 0.01:
    for k in range(4):
        kick(t + k * B)
        hat(t + k * B + B / 2)
        hat(t + k * B + B / 4, 0.45); hat(t + k * B + 3 * B / 4, 0.45)
    snare(t + B); clap(t + 3 * B); snare(t + 3 * B)
    t += 4 * B
chords(8.0, 26.9, 1.0, stab=True)
# الخاتمة (26.9–30)
for k in range(5): kick(26.9 + k * B, 0.7); hat(26.9 + k * B + B / 2)
chords(26.9, 30.0, 0.8)
fade = np.ones(N); a = int(29.0 * SR); fade[a:] = np.linspace(1, 0, N - a); fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
M *= fade[:, None]

# مؤثرات
def whoosh(at, g=1.0, d=0.45):
    n = int(d * SR); tt = ta(n); add(F, filt(rng.standard_normal(n), lo=500, hi=5000) * np.sin(np.pi * tt / tt[-1]) ** 2, at - d * 0.6, 0.30 * g)
def impact(at, g=1.0):
    n = int(1.4 * SR); tt = ta(n)
    s = np.sin(2 * np.pi * (35 + 70 * np.exp(-tt * 9)) * tt) * np.exp(-tt * 3) + filt(rng.standard_normal(n), hi=2500) * np.exp(-tt * 10) * 0.6
    add(F, s, at, 0.55 * g)
def pop(at, g=1.0, f0=380):
    n = int(0.12 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * (f0 + 900 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 24), at, 0.20 * g, rng.uniform(-0.4, 0.4))
def thud(at):
    n = int(0.3 * SR); tt = ta(n)
    add(F, np.sin(2 * np.pi * (60 + 80 * np.exp(-tt * 25)) * tt) * np.exp(-tt * 12) + filt(rng.standard_normal(n), lo=200, hi=1800) * np.exp(-tt * 25) * 0.5, at, 0.45)
def buzz(at):
    n = int(0.45 * SR); tt = ta(n); add(F, filt(np.sign(np.sin(2 * np.pi * 110 * tt)) * 0.6 + saw(116, n) * 0.4, hi=2500) * np.minimum(1, (0.45 - tt) / 0.05), at, 0.16)
def shimmer(at, g=1.0):
    for i, f in enumerate([1568, 2093, 2637, 3136]):
        n = int(0.9 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 5), at + i * 0.05, 0.07 * g, -0.5 + i * 0.33)
def click(at):
    n = int(0.04 * SR); tt = ta(n); add(F, filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-tt * 170), at, 0.35)
def tick(at):
    n = int(0.03 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 120), at, 0.10)
def kaching(at):
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        n = int(1.2 * SR); tt = ta(n); add(F, (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt * 3.5), at + 0.06 + i * 0.03, 0.10)
    n = int(0.15 * SR); tt = ta(n); add(F, filt(rng.standard_normal(n), lo=2000) * np.exp(-tt * 40), at, 0.25)
def key(at):
    n = int(0.03 * SR); tt = ta(n); add(F, filt(rng.standard_normal(n), lo=1800, hi=8000) * np.exp(-tt * 230), at, 0.22, rng.uniform(-0.3, 0.3))

whoosh(0.15, 1.2, 0.6); impact(0.8); shimmer(1.2); whoosh(1.25, 0.6); pop(1.9, 0.8)
for t_ in [2.62, 8.0, 21.0, 24.0, 26.9]: whoosh(t_, 1.4, 0.4)
for i in range(3): whoosh(2.8 + i * 0.55, 0.8, 0.3); thud(3.25 + i * 0.55)
buzz(4.6); whoosh(5.25, 1.0, 0.6)
impact(6.3, 0.7); impact(6.65, 0.8)
impact(8.0, 0.9)
for i in range(6):
    a = 8.0 + i * 13.0 / 6
    if i: whoosh(a, 1.1, 0.35)
    click(a + 0.4); pop(a + 0.6, 1.0, 420)
for i in range(14): pop(21.3 + i * 0.07, 0.7, 300 + i * 40)
for i in range(3): pop(22.6 + i * 0.25, 1.0, 600)
for i in range(12): tick(24.4 + i * 0.07)
kaching(25.25); impact(25.25, 0.5)
impact(26.95, 0.7); shimmer(27.1, 1.2)
for k in range(16): key(27.6 + k * 0.062)
for k in range(16): key(28.2 + k * 0.062)
pop(27.35, 1.2, 500)

M = M / np.max(np.abs(M)) * 0.55
F = F / np.max(np.abs(F)) * 0.6
mix = M + F
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print('ok')
