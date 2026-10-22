# موسيقى ومؤثرات فيديو شرح الجوال (مولّدة بالكامل) + مزج مع الصوت.
# python3 -I music.py <events.json> <voice.mp3> <out.wav>
import sys, wave, json, subprocess
import numpy as np
ev = json.load(open(sys.argv[1])); vo_path, out_path = sys.argv[2], sys.argv[3]
SR = 44100
DUR = ev['duration']; N = int(SR * DUR)
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
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * 1.41; r = np.sin((pan + 1) * np.pi / 4) * 1.41
    buf[i:i + len(sig), 0] += sig * g * l; buf[i:i + len(sig), 1] += sig * g * r
def note(m): return 440 * 2 ** ((m - 69) / 12)
def tri(f, n):
    ph = (t_arr(n) * f) % 1.0
    return 4 * np.abs(ph - 0.5) - 1

# ── موسيقى: كل فصل إلو تسلسل وأربيجيو مختلف شوي حتى ما تمل الأذن
PROGS = [
    [[48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]],  # C G Am F
    [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]],  # Am F C G
    [[41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [45, 52, 57, 60, 64]],  # F G Am Am
    [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]],  # C Am F G
]
PATS = [[2, 3, 4, 3, 2, 4, 3, 4], [4, 3, 2, 3, 4, 2, 3, 2], [2, 4, 3, 4, 2, 4, 3, 4], [3, 2, 4, 2, 3, 4, 2, 4]]
secs = ev['sections'] + [DUR]
bar = 2.5
for si in range(len(secs) - 1):
    a, b = secs[si], secs[si + 1]
    prog, pat = PROGS[si % 4], PATS[(si * 3) % 4]
    t0 = a; k = 0
    while t0 < b - 0.2:
        ch = prog[k % 4]; n = int(min(bar + 0.8, DUR - t0) * SR)
        if n <= 0: break
        pad = sum(tri(note(m), n) for m in ch) / len(ch)
        pad = filt(pad, hi=1000) * env(n, 0.8, 0.8)
        add(M, pad, t0, 0.45, -0.3); add(M, pad, t0 + 0.012, 0.45, 0.3)
        for j in range(8):
            m = ch[pat[j]] + 12
            nn = int(0.6 * SR); tt = t_arr(nn)
            s = (np.sin(2 * np.pi * note(m) * tt) + 0.3 * np.sin(4 * np.pi * note(m) * tt)) * np.exp(-tt * 6)
            add(M, s, t0 + j * bar / 8, 0.2, -0.4 + 0.1 * j)
        for j in range(4):
            nn = int(0.5 * SR); tt = t_arr(nn)
            add(M, np.sin(2 * np.pi * note(ch[0] - 12) * tt) * np.exp(-tt * 5), t0 + j * bar / 4, 0.33)
            # هاي هات ناعم
            hn = int(0.04 * SR); h = filt(rng.standard_normal(hn), lo=6000) * np.exp(-t_arr(hn) * 120)
            add(M, h, t0 + j * bar / 4 + bar / 8, 0.05, 0.3)
        t0 += bar; k += 1
fade = np.ones(N); fi = int(1.5 * SR); fo = int(3 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
M *= fade[:, None]

# ── مؤثرات
def click(at):
    n = int(0.05 * SR); t = t_arr(n)
    c = filt(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-t * 180) + np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 300) * 0.4
    add(F, c, at, 0.45)
def whoosh(at, g=1.0, dur=0.8):
    n = int(dur * SR); t = t_arr(n)
    w = filt(rng.standard_normal(n), lo=300, hi=3500) * np.sin(np.pi * t / t[-1]) ** 2
    add(F, w, at - dur / 2 + 0.2, 0.28 * g)
def pop(at, g=1.0):
    n = int(0.18 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * (300 + 900 * np.exp(-t * 30)) * t) * np.exp(-t * 22), at, 0.18 * g)
def chime(at):
    for i, m in enumerate([76, 79, 84]):
        n = int(0.9 * SR); t = t_arr(n)
        s = (np.sin(2 * np.pi * note(m) * t) + 0.25 * np.sin(4 * np.pi * note(m) * t)) * np.exp(-t * 5)
        add(F, s, at + i * 0.07, 0.15)
def beep(at):
    n = int(0.16 * SR); t = t_arr(n)
    add(F, np.sin(2 * np.pi * 2700 * t) * env(n, 0.005, 0.03), at, 0.16)
for c in ev['click']: click(c + 0.08)
for c in ev['whoosh']: whoosh(c, 1.3, 1.0)
for c in ev['swish']: whoosh(c, 0.35, 0.45)
for c in ev['pop']: pop(c, 0.8)
for c in ev['chime']: chime(c)
for c in ev['beep']: beep(c)

# ── المزج
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
vo = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
win = int(0.05 * SR)
envv = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode='same'))
active = np.clip((envv - 0.01) / 0.03, 0, 1)
k = int(0.4 * SR); active = np.convolve(active, np.ones(k) / k, mode='same')
M *= (1 - 0.55 * active)[:, None]
M = M / np.max(np.abs(M)) * 0.2
F = F / np.max(np.abs(F)) * 0.42
mix = M + F + np.stack([vo, vo], axis=1)
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', DUR)
