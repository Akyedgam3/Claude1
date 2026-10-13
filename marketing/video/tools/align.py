# محاذاة جمل النص مع مقاطع الكلام (بدون نموذج تعرف صوتي): برمجة ديناميكية على الأطوال.
import json, subprocess, sys, re
mp3, script_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', mp3, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], capture_output=True, text=True).stderr
st = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', log)]
en = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', log)]
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], capture_output=True, text=True).stdout)
chunks = []
prev = 0.0
for s, e in zip(st, en + [dur]):
    if s - prev > 0.12: chunks.append((prev, s))
    prev = e
if dur - prev > 0.12: chunks.append((prev, dur))
sents = [l.strip() for l in open(script_path, encoding='utf8') if l.strip()]
def weight(t):
    t = re.sub(r'[«»،,.!؟?:]', ' ', t)
    return sum(len(w) for w in t.split()) + 2.2 * len(t.split())
W = [weight(s) for s in sents]
total_speech = sum(e - s for s, e in chunks)
rate = total_speech / sum(W)
n, m = len(sents), len(chunks)
INF = 1e18
dp = [[INF] * (m + 1) for _ in range(n + 1)]
bk = [[0] * (m + 1) for _ in range(n + 1)]
dp[0][0] = 0
for i in range(1, n + 1):
    for j in range(1, m + 1):
        for k in range(max(0, j - 8), j):
            if dp[i - 1][k] >= INF: continue
            d = sum(e - s for s, e in chunks[k:j])
            exp = W[i - 1] * rate
            c = ((d - exp) / max(exp, 0.6)) ** 2
            # الجملة يجب أن تنتهي عند وقفة واضحة أكثر من الوقفات داخلها
            gap = chunks[j][0] - chunks[j - 1][1] if j < m else 1.0
            c -= min(gap, 1.2) * 0.35
            if dp[i - 1][k] + c < dp[i][j]:
                dp[i][j] = dp[i - 1][k] + c; bk[i][j] = k
res = []
j = m
for i in range(n, 0, -1):
    k = bk[i][j]
    res.append({'start': round(chunks[k][0], 2), 'end': round(chunks[j - 1][1], 2), 'text': sents[i - 1]})
    j = k
res.reverse()
json.dump(res, open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
for r in res: print(f"{r['start']:7.2f}-{r['end']:7.2f}  {r['text']}")
