# بيت قوي 128 BPM (كيك، 808، سنث، هاتس) + مؤثرات مربوطة بالحركات، والموسيقى بتنخفض تحت الصوت.
import sys, wave, subprocess
import numpy as np
SR = 44100; DUR = 71.6; N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(11)
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
def saw(f, n): return 2 * ((ta(n) * f) % 1.0) - 1

BEAT = 60 / 128; BAR = 4 * BEAT
# Fm - Db - Ab - Eb
prog = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]]
roots = [41, 37, 44, 39]
BREAKS = [(4.3, 4.85), (46.75, 47.38)]  # سكتة قبل الشعار
def in_break(t): return any(a <= t < b for a, b in BREAKS)
sc = np.ones(N)  # سايدتشين من الكيك
kicks = []
t0 = 0.0; k = 0
while t0 < 70.0:
    ch = prog[k % 4]; rt = roots[k % 4]
    full = t0 >= 4.85
    for j in range(4):
        tb = t0 + j * BEAT
        if in_break(tb): continue
        if full or j % 2 == 0: kicks.append(tb)
    # 808 باص بنمط
    for j, (pos, ln) in enumerate([(0, 0.7), (1.5, 0.3), (2, 0.6), (3.5, 0.4)]):
        tb = t0 + pos * BEAT
        if in_break(tb) or not full: continue
        n = int(ln * SR); tt = ta(n)
        f = note(rt - 12) * (1 + 0.6 * np.exp(-tt * 40))
        b = np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-tt * 2.5)
        add(M, b, tb, 0.55)
    # سنث ستابس (أوف بيت)
    for j in range(8):
        tb = t0 + j * BEAT / 2
        if j % 2 == 0 or in_break(tb) or t0 < 4.85: continue
        n = int(0.16 * SR)
        s = sum(saw(note(m + 12), n) + saw(note(m + 12) * 1.006, n) for m in ch) / 6
        s = filt(s, hi=3200) * np.exp(-ta(n) * 14)
        add(M, s, tb, 0.22, -0.4 + (j % 4) * 0.25)
    # باد خفيف دايم
    n = int(BAR * SR)
    pad = sum(saw(note(m), n) + saw(note(m) * 1.003, n) for m in ch) / (2 * len(ch))
    pad = filt(pad, hi=900) * np.minimum(1, np.minimum(ta(n) / 0.05, (BAR - ta(n)) / 0.2))
    add(M, pad, t0, 0.18 if full else 0.28, -0.3); add(M, pad, t0 + 0.01, 0.18 if full else 0.28, 0.3)
    # هاتس وكلاب
    if full:
        for j in range(16):
            tb = t0 + j * BEAT / 4
            if in_break(tb): continue
            hn = int(0.05 * SR)
            hat = filt(rng.standard_normal(hn), lo=8000) * np.exp(-ta(hn) * (50 if j % 2 else 80))
            add(M, hat, tb, 0.13 if j % 2 else 0.2, 0.35)
        for j in (1, 3):
            tb = t0 + j * BEAT
            if in_break(tb): continue
            cn = int(0.22 * SR)
            clap = sum(filt(rng.standard_normal(cn), lo=900, hi=6000) * np.exp(-np.maximum(ta(cn) - d, 0) * 25) * (ta(cn) >= d) for d in (0, 0.012, 0.024))
            add(M, clap, tb, 0.42)
    t0 += BAR; k += 1
for tb in kicks:
    n = int(0.35 * SR); tt = ta(n)
    kick = np.tanh(3 * np.sin(2 * np.pi * np.cumsum(48 + 170 * np.exp(-tt * 30)) / SR)) * np.exp(-tt * 7)
    click = filt(rng.standard_normal(n), lo=2500) * np.exp(-tt * 200) * 0.4
    add(M, kick + click, tb, 1.0)
    i = int(tb * SR); m = min(N - i, int(0.3 * SR))
    if m > 0: sc[i:i + m] = np.minimum(sc[i:i + m], 0.35 + 0.65 * (np.arange(m) / m) ** 0.6)
M[:, 0] *= sc; M[:, 1] *= sc
fade = np.ones(N); fade[:int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
a = int(69.6 * SR); fade[a:] = np.linspace(1, 0, N - a)
M *= fade[:, None]

# ── مؤثرات
def impact(at, g=1.0):
    n = int(0.9 * SR); tt = ta(n)
    boom = np.tanh(2 * np.sin(2 * np.pi * np.cumsum(38 + 120 * np.exp(-tt * 14)) / SR)) * np.exp(-tt * 4)
    crack = filt(rng.standard_normal(n), lo=1200) * np.exp(-tt * 30)
    add(F, boom * 0.9 + crack * 0.45, at, 0.6 * g)
def whoosh(at, g=1.0, d=0.45):
    n = int(d * SR); tt = ta(n)
    w = filt(rng.standard_normal(n), lo=500, hi=6000) * np.sin(np.pi * tt / tt[-1]) ** 2
    add(F, w, at - d * 0.7, 0.32 * g, rng.uniform(-0.4, 0.4))
def pop(at, g=1.0):
    n = int(0.15 * SR); tt = ta(n)
    add(F, np.sin(2 * np.pi * (300 + 1100 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 22), at, 0.28 * g)
def key(at):
    n = int(0.03 * SR); tt = ta(n)
    add(F, filt(rng.standard_normal(n), lo=1800, hi=8000) * np.exp(-tt * 230), at, 0.3 + 0.1 * rng.random(), rng.uniform(-0.3, 0.3))
def typing(a, d, c):
    for i in range(c): key(a + d * i / c + rng.uniform(-0.01, 0.01))
def click(at):
    n = int(0.06 * SR); tt = ta(n)
    add(F, filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-tt * 160) + np.sin(2 * np.pi * 2200 * tt) * np.exp(-tt * 260) * 0.6, at, 0.55)
def riser(a, b, g=1.0):
    n = int((b - a) * SR); tt = ta(n); p = tt / tt[-1]
    s = filt(rng.standard_normal(n), lo=600, hi=8000) * p ** 2 * 0.6 + np.sin(2 * np.pi * np.cumsum(150 + 1800 * p ** 2) / SR) * p * 0.2
    add(F, s, a, 0.4 * g)
def coin(at):
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        n = int(0.7 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 6), at + i * 0.035, 0.08)
def bell(at):
    for r in range(4):
        n = int(0.35 * SR); tt = ta(n)
        s = (np.sin(2 * np.pi * 1760 * tt) + 0.6 * np.sin(2 * np.pi * 2640 * tt)) * np.exp(-tt * 9)
        add(F, s, at + r * 0.13, 0.1)
def zap(at):
    n = int(0.3 * SR); tt = ta(n)
    add(F, np.sign(np.sin(2 * np.pi * np.cumsum(1800 * np.exp(-tt * 9) + 80) / SR)) * np.exp(-tt * 10) * 0.5, at, 0.18)
def stamp(at):
    n = int(0.4 * SR); tt = ta(n)
    add(F, np.sin(2 * np.pi * (70 + 70 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 12) + filt(rng.standard_normal(n), lo=600, hi=3000) * np.exp(-tt * 35) * 0.5, at, 0.7)
def cash(at):
    n = int(1.2 * SR); tt = ta(n)
    s = (np.sin(2 * np.pi * 1568 * tt) + 0.5 * np.sin(2 * np.pi * 2349 * tt)) * np.exp(-tt * 4)
    add(F, s, at, 0.16); add(F, s * 0.7, at + 0.12, 0.12)
def tick(at):
    n = int(0.025 * SR); tt = ta(n); add(F, np.sin(2 * np.pi * 3200 * tt) * np.exp(-tt * 300), at, 0.12)

def beep(at, f=2400, d=0.12):
    n = int(d * SR); tt = ta(n); add(F, np.sign(np.sin(2 * np.pi * f * tt)) * 0.4 * np.minimum(1, (d - tt) / 0.02), at, 0.18)
HITS = [0.29, 0.75, 1.78, 3.32, 5.11, 6.37, 7.67, 9.79, 10.3, 11.69, 12.96, 13.95, 14.82, 16.4, 17.72, 18.66, 19.83, 20.98, 22.61, 23.0, 24.45, 25.46, 26.96, 28.22, 29.71, 30.64, 33.42, 35.53, 37.2, 38.29, 39.82, 40.88, 42.4, 43.49, 45.47, 47.38, 51.45, 53.09, 54.16, 54.9, 56.23, 68.36]
BIG = {0.29, 5.11, 7.67, 9.79, 12.96, 16.4, 22.61, 24.45, 29.71, 35.53, 37.2, 42.4, 47.38, 54.16, 56.23}
for h in HITS: impact(h, 1.25 if h in BIG else 0.6)
for s_ in [4.75, 6.1, 9.4, 11.4, 16.0, 22.1, 24.1, 29.3, 35.1, 36.8, 42.0, 46.9, 51.0, 55.8, 1.6, 7.67, 12.96, 19.83, 26.96, 40.88]: whoosh(s_, 1.1)
for p in [0.9, 1.95, 2.07, 2.19, 2.31, 2.43, 3.5, 7.9, 9.9, 13.05, 14.82, 16.4, 17.72, 18.66, 19.9, 20.98, 21.3, 23.15, 25.46, 26.96, 28.22, 30.64, 33.42, 35.7, 39.82, 40.88, 41.0, 45.3, 51.6, 51.8, 56.23, 67.4, 67.6, 68.7]: pop(p)
typing(6.4, 0.7, 13); typing(48.57, 1.2, 14); typing(57.94, 3.9, 16); typing(63.23, 3.9, 16)
beep(7.18); beep(7.95, 2600, 0.08); beep(8.3, 2600, 0.08); beep(11.8); beep(12.96, 2600, 0.1)
riser(3.7, 4.85, 1.2); riser(45.9, 47.33, 1.4); riser(55.0, 56.2, 0.8)
for i in range(12): tick(10.25 + i * 0.05)
stamp(10.0); bell(30.64); bell(33.42); click(38.29); coin(43.49); coin(43.65); zap(45.6); click(52.4); stamp(54.9); cash(54.2)
for i in range(10): tick(54.16 + i * 0.05)
cash(39.85)

raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR); envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
act = np.clip((envv - 0.01) / 0.03, 0, 1); kk = int(0.2 * SR); act = np.convolve(act, np.ones(kk) / kk, mode='same')
M *= (1 - 0.5 * act)[:, None]
M = M / np.max(np.abs(M)) * 0.34
F = F / np.max(np.abs(F)) * 0.42
vo = vo / np.max(np.abs(vo)) * 0.62
mix = M + F + np.stack([vo, vo], axis=1)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok')
