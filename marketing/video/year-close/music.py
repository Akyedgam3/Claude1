# موسيقى فيديو «تسكير السنة»: هادية ودافية (باد + أربيجيو ناعم + بيس)، بتنخفض تحت الصوت، ونقرات خفيفة مع التأشيرات.
# python3 -I music.py <out.wav> <voice.mp3>
import sys, wave, subprocess
import numpy as np

SR = 44100
DUR = 70.0
N = int(SR * DUR)
out_path, vo_path = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(7)
M = np.zeros((N, 2))
FX = np.zeros((N, 2))
t_all = np.arange(N) / SR


def note(f, dur, kind='pad', g=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == 'pad':
        s = sum(np.sin(2 * np.pi * f * h * t + d) / h for h, d in [(1, 0), (2, 0.3), (3, 1.1)])
        s += 0.5 * np.sin(2 * np.pi * f * 1.004 * t)
        e = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.5)
    elif kind == 'pluck':
        s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t) + 0.12 * np.sin(2 * np.pi * f * 3 * t)
        e = np.exp(-t * 3.2) * np.minimum(1, t / 0.006)
    else:  # bass
        s = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 2 * t)
        e = np.minimum(1, t / 0.02) * np.exp(-t * 0.9)
    return s * e * g


def add(buf, sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[i:i + len(sig), 0] += sig * g * l
    buf[i:i + len(sig), 1] += sig * g * r


hz = lambda m: 440 * 2 ** ((m - 69) / 12)
# تتابع دافي: Fmaj7 - Am7 - Dm7 - Bb(add9)، كل كورد 4 ثواني (BPM 90 تقريباً)
CHORDS = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 65], [46, 53, 58, 62]]
BAR = 4.0
beat = BAR / 6
t0 = 0.0
k = 0
while t0 < DUR - 2:
    ch = CHORDS[k % 4]
    for m in ch:
        add(M, note(hz(m), BAR + 1.2, 'pad', 0.05), t0, pan=rng.uniform(-0.4, 0.4))
    add(M, note(hz(ch[0] - 12), BAR, 'bass', 0.18), t0)
    if t0 > 3.5:  # الأربيجيو بيدخل بعد المقدمة
        seq = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12]
        for i, m in enumerate(seq):
            add(M, note(hz(m), 1.2, 'pluck', 0.06), t0 + i * beat, pan=0.35 if i % 2 else -0.35)
    t0 += BAR
    k += 1

# نقرات مع التأشيرات (متل الفيديو)
CLICKS = [5.45, 9.65, 12.95, 21.65, 51.65]
for c in CLICKS:
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    click = (rng.standard_normal(n) * 0.5 + np.sin(2 * np.pi * 2400 * t)) * np.exp(-t * 90)
    add(FX, click, c, 0.18)
# «ووش» ناعم بانتقال المشاهد
for w in [4.0, 11.8, 22.7, 36.9, 48.5, 55.0, 63.3]:
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    X = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= np.exp(-((f - 1800) / 1400) ** 2)
    sw = np.fft.irfft(X, n) * np.sin(np.pi * t / 0.6) ** 2
    add(FX, sw / (np.abs(sw).max() + 1e-9), w - 0.3, 0.05)
# جرس صغير بالخاتمة
for i, m in enumerate([72, 76, 79, 84]):
    add(FX, note(hz(m), 2.5, 'pluck', 0.12), 63.5 + i * 0.12)

# الخفض تحت الصوت
vo = subprocess.run(['ffmpeg', '-v', 'error', '-i', vo_path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
v = np.frombuffer(vo, np.int16).astype(np.float64) / 32768
v = np.pad(v, (0, max(0, N - len(v))))[:N]
win = int(0.25 * SR)
envv = np.convolve(np.abs(v), np.ones(win) / win, mode='same')
duck = 1 - 0.62 * np.clip(envv / 0.04, 0, 1)
duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode='same')
M *= duck[:, None]
# بداية ونهاية
fade = np.minimum(1, t_all / 1.0) * np.minimum(1, (DUR - t_all) / 2.5)
mix = (M + FX) * fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.55
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print('music', out_path)
