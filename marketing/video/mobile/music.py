# بيت قوي 128 BPM (كيك، 808، سنث، هاتس) + مؤثرات مربوطة بالحركات، والموسيقى بتنخفض تحت الصوت.
import sys, wave, subprocess
import numpy as np
SR = 44100; DUR = 57.6; N = int(SR * DUR)
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
BREAKS = [(4.0, 4.5), (35.1, 35.79)]  # سكتة قبل الشعار
def in_break(t): return any(a <= t < b for a, b in BREAKS)
sc = np.ones(N)  # سايدتشين من الكيك
kicks = []
t0 = 0.0; k = 0
while t0 < 56.0:
    ch = prog[k % 4]; rt = roots[k % 4]
    full = t0 >= 4.5
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
        if j % 2 == 0 or in_break(tb) or t0 < 4.5: continue
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
a = int(55.6 * SR); fade[a:] = np.linspace(1, 0, N - a)
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

HITS = [0.25, 0.7, 1.77, 3.15, 4.57, 5.71, 7.06, 8.39, 9.4, 10.19, 12.0, 12.4, 13.41, 14.7, 15.44, 16.45, 19.06, 20.37, 21.63, 22.7, 24.28, 24.7, 25.74, 26.6, 28.09, 29.37, 30.18, 30.91, 32.23, 32.95, 33.98, 35.79, 38.64, 40.01, 40.89, 41.5, 42.75, 54.31]
BIG = {0.25, 4.57, 7.06, 12.0, 16.45, 24.28, 28.09, 32.23, 35.79, 40.89, 42.75}
for h in HITS: impact(h, 1.25 if h in BIG else 0.6)
for s in [4.4, 5.55, 11.85, 13.3, 18.85, 21.5, 24.15, 25.6, 27.95, 32.1, 35.6, 38.5, 42.6, 1.6, 3.0]: whoosh(s, 1.2)
for p in [0.85, 1.95, 3.3, 3.4, 3.5, 8.39, 9.4, 10.19, 12.55, 12.7, 12.8, 13.41, 14.7, 15.44, 16.6, 19.2, 19.5, 20.6, 21.75, 22.05, 22.9, 24.85, 25.8, 26.0, 26.2, 29.37, 30.18, 30.91, 33.98, 38.8, 39.0, 43.0, 53.5, 53.7, 54.6]: pop(p)
typing(5.85, 1.0, 15); typing(36.5, 1.1, 14); typing(44.26, 3.4, 16); typing(49.27, 3.4, 16)
riser(3.4, 4.5, 1.2); riser(34.4, 35.75, 1.4); riser(41.9, 42.72, 0.8)
bell(17.0); coin(32.95); coin(33.1); zap(34.3); click(39.55); stamp(41.5); cash(40.9)
for i in range(10): tick(40.89 + i * 0.05)
whoosh(20.95, 1.4, 0.6)

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
