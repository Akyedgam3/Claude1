# موسيقى إعلان سريعة مع درامز، ومؤثرات مربوطة بالحركات، ومزج تحت الصوت.
import sys, wave, subprocess
import numpy as np
SR = 44100
DUR = 62.0
N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(7)
M = np.zeros((N, 2)); F = np.zeros((N, 2))
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
def saw(f, n):
    ph = (t_arr(n) * f) % 1.0
    return 2 * ph - 1

# ── الموسيقى: 120 BPM، Am - F - C - G
BEAT = 0.5; BAR = 4 * BEAT
prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
start, end = 0.0, 60.5
k = 0; t0 = start
while t0 < end:
    ch = prog[k % 4]; n = int(BAR * SR)
    pad = sum(saw(note(m), n) + saw(note(m) * 1.004, n) for m in ch) / (2 * len(ch))
    pad = filt(pad, hi=1400) * env(n, 0.05, 0.3)
    add(M, pad, t0, 0.32, -0.25); add(M, pad, t0 + 0.012, 0.32, 0.25)
    # أربيجيو بالأثمان
    for j in range(8):
        m = ch[[0, 1, 2, 1, 2, 0, 2, 1][j]] + 12
        nn = int(0.3 * SR); tt = t_arr(nn)
        s = (np.sin(2 * np.pi * note(m) * tt) + 0.4 * np.sin(4 * np.pi * note(m) * tt)) * np.exp(-tt * 10)
        add(M, s, t0 + j * BEAT / 2, 0.2, -0.5 + j * 0.14)
    # باص
    for j in range(4):
        nn = int(0.45 * SR); tt = t_arr(nn)
        b = np.sin(2 * np.pi * note(ch[0] - 24) * tt) * np.exp(-tt * 4)
        add(M, b, t0 + j * BEAT, 0.55)
    # درامز (بتبلّش بعد الشعار)
    if t0 >= 4.9 and not (52.2 <= t0 < 53.4):
        for j in range(4):
            nn = int(0.3 * SR); tt = t_arr(nn)
            kick = np.sin(2 * np.pi * (50 + 120 * np.exp(-tt * 25)) * tt) * np.exp(-tt * 9)
            add(M, kick, t0 + j * BEAT, 0.9)
            hn = int(0.06 * SR)
            hat = filt(rng.standard_normal(hn), lo=7000) * np.exp(-t_arr(hn) * 60)
            add(M, hat, t0 + j * BEAT + BEAT / 2, 0.22, 0.3)
            if j in (1, 3):
                cn = int(0.18 * SR)
                clap = filt(rng.standard_normal(cn), lo=900, hi=5000) * np.exp(-t_arr(cn) * 22)
                add(M, clap, t0 + j * BEAT, 0.35, -0.1)
    t0 += BAR; k += 1
fade = np.ones(N); fo = int(2.0 * SR); fi = int(0.3 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[int(60.0 * SR):int(60.0 * SR) + fo] = np.linspace(1, 0, fo); fade[int(60.0 * SR) + fo:] = 0
M *= fade[:, None]

# ── المؤثرات
def whoosh(at, g=1.0, dur=0.55):
    n = int(dur * SR); t = t_arr(n)
    w = filt(rng.standard_normal(n), lo=400, hi=4500) * np.sin(np.pi * t / t[-1]) ** 2
    add(F, w, at - dur * 0.6, 0.3 * g)
def hit(at, g=1.0):
    n = int(0.5 * SR); t = t_arr(n)
    boom = np.sin(2 * np.pi * (45 + 90 * np.exp(-t * 18)) * t) * np.exp(-t * 6)
    snap = filt(rng.standard_normal(n), lo=1500) * np.exp(-t * 40)
    add(F, boom * 0.9 + snap * 0.35, at, 0.55 * g)
def pop(at, g=1.0):
    n = int(0.16 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * (320 + 1000 * np.exp(-t * 32)) * t) * np.exp(-t * 24), at, 0.3 * g)
def key(at):
    n = int(0.03 * SR); t = t_arr(n)
    k = filt(rng.standard_normal(n), lo=1800, hi=7500) * np.exp(-t * 230)
    add(F, k, at, 0.22 + 0.1 * rng.random(), rng.uniform(-0.3, 0.3))
def typing(a, d, chars):
    for i in range(chars): key(a + d * i / chars + rng.uniform(-0.01, 0.01))
def click(at):
    n = int(0.05 * SR); t = t_arr(n)
    add(F, filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-t * 180) + np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 300) * 0.5, at, 0.5)
def printer(at, dur):
    n = int(dur * SR); t = t_arr(n)
    buzz = filt(rng.standard_normal(n), lo=900, hi=5000) * (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 10 * t)))
    motor = np.sin(2 * np.pi * 180 * t) * 0.3
    add(F, (buzz + motor) * env(n, 0.04, 0.12), at, 0.2)
def stamp(at):
    n = int(0.35 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 14) + filt(rng.standard_normal(n), lo=600, hi=3000) * np.exp(-t * 35) * 0.5, at, 0.6)
def buzzer(at):
    n = int(0.35 * SR); t = t_arr(n)
    add(F, np.sign(np.sin(2 * np.pi * 140 * t)) * env(n, 0.01, 0.08) * 0.5, at, 0.14)
def tick(at):
    n = int(0.025 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 300), at, 0.12)
def coin(at):
    for i, f in enumerate([2093, 2637, 3136]):
        n = int(0.6 * SR); t = t_arr(n)
        add(F, np.sin(2 * np.pi * f * t) * np.exp(-t * 7), at + i * 0.03, 0.09)
def snip(at):
    n = int(0.08 * SR); t = t_arr(n)
    add(F, filt(rng.standard_normal(n), lo=2500, hi=9000) * np.exp(-t * 70), at, 0.35)
def ding(at, g=1.0):
    n = int(1.6 * SR); t = t_arr(n)
    s = (np.sin(2 * np.pi * 1320 * t) + 0.5 * np.sin(2 * np.pi * 1980 * t) + 0.25 * np.sin(2 * np.pi * 2640 * t)) * np.exp(-t * 2.6)
    add(F, s, at, 0.16 * g); add(F, s, at + 0.22, 0.09 * g)
def riser(a, b):
    n = int((b - a) * SR); t = t_arr(n)
    f = 200 + 1600 * (t / t[-1]) ** 2
    s = filt(rng.standard_normal(n), lo=500, hi=6000) * (t / t[-1]) ** 2 * 0.6 + np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / t[-1]) * 0.15
    add(F, s, a, 0.35)

for at in [3.3, 4.95, 9.6, 13.85, 17.75, 21.15, 24.85, 28.6, 33.2, 37.0, 39.05, 40.95, 44.15, 47.35, 50.3, 53.25, 57.15]:
    whoosh(at)
for at in [0.22, 1.18, 2.2, 9.78, 14.0, 17.87, 21.28, 24.95, 28.72, 33.32, 37.1, 37.9, 39.2, 41.08, 44.28, 48.55, 50.42, 51.68, 57.3]:
    hit(at)
for at in [0.3, 1.26, 2.28, 10.1, 18.15, 23.3, 26.0, 26.25, 29.0, 31.4, 33.6, 34.85, 35.7, 35.85, 40.0, 42.5, 44.4, 47.5, 57.7, 57.95, 58.2, 58.5]:
    pop(at)
for i in range(8): pop(14.15 + i * 0.09, 0.6)
for i in range(6): pop(22.4 + i * 0.08, 0.6)
for i in range(9): pop(47.9 + i * 0.07, 0.5)
for i in range(4): tick(31.9 + i * 0.12)
typing(3.4, 0.95, 16); typing(6.3, 2.5, 30); typing(30.35, 1.0, 15)
click(11.1); printer(11.25, 1.9); stamp(13.05)
buzzer(16.45)
for i in range(4): tick(19.15 + i * 0.3)
for i in range(16): tick(19.1 + i * 0.08)
for i in range(18): tick(44.4 + i * 0.09)
snip(27.45); snip(27.65); snip(27.85); snip(28.05)
coin(37.15); coin(37.92)
ding(5.0); ding(13.1, 0.6); ding(53.3, 1.2)
riser(51.9, 53.25)
whoosh(46.1, 1.4, 0.4)

# ── المزج
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
active = np.clip((envv - 0.01) / 0.03, 0, 1)
kk = int(0.25 * SR); active = np.convolve(active, np.ones(kk) / kk, mode='same')
M *= (1 - 0.45 * active)[:, None]
M = M / np.max(np.abs(M)) * 0.26
F = F / np.max(np.abs(F)) * 0.42
mix = M + F + np.stack([vo, vo], axis=1) * 1.0
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok')
