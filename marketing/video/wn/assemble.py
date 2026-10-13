import json, re, os
D = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(D, '..', 'tut3', 'src.html')
lines = open(T, encoding='utf8').read().split('\n')
head = '\n'.join(lines[:145]).replace('Mizan Tutorial — Tailoring', "Mizan — What's New")
tail = '\n'.join(lines[820:]).replace('window.DURATION = 211.0;', 'window.DURATION = 180.5;')
part = open(os.path.join(D, 'part.html'), encoding='utf8').read()
al = json.load(open(os.path.join(D, 'align.json'), encoding='utf8'))
PAUSES = []
_cur = None
for _l in open(os.path.join(D, 'pauses.txt')):
    _k, _v = _l.split(); _v = float(_v)
    if _k.startswith('silence_start'): _cur = _v
    elif _cur is not None: PAUSES.append((_cur, _v))
subs = []
for s in al:
    t = s['text'].strip().rstrip('.')
    if len(t) <= 58:
        subs.append([s['start'], s['end'], t]); continue
    # قسّم على الفواصل لقطع ≤ 58 حرف
    parts = re.split(r'(?<=[،:,])\s+', t)
    chunks, cur = [], ''
    for p in parts:
        if cur and len(cur) + 1 + len(p) > 58: chunks.append(cur); cur = p
        else: cur = (cur + ' ' + p).strip()
    if cur:
        if chunks and len(cur) < 12: chunks[-1] += ' ' + cur
        else: chunks.append(cur)
    total = sum(len(c) for c in chunks); dur = s['end'] - s['start']
    # حدود القطع: التقدير النسبي، ثم أقرب سكتة حقيقية بالصوت
    inner = [(a, b) for a, b in PAUSES if a > s['start'] + 0.2 and b < s['end'] + 0.6 and a < s['end'] - 0.05]
    t0 = s['start']; acc = 0
    for k, c in enumerate(chunks):
        acc += len(c)
        if k == len(chunks) - 1:
            subs.append([round(t0, 2), s['end'], c.rstrip('،,')]); break
        est = s['start'] + dur * acc / total
        near = min(inner, key=lambda p: abs(p[0] - est), default=None)
        if near and abs(near[0] - est) < 1.2 and near[0] > t0 + 0.4:
            subs.append([round(t0, 2), round(near[0], 2), c.rstrip('،,')]); t0 = near[1]
        else:
            subs.append([round(t0, 2), round(est - 0.12, 2), c.rstrip('،,')]); t0 = est
part = part.replace('{{subs}}', json.dumps(subs, ensure_ascii=False))
open(os.path.join(D, 'src.html'), 'w', encoding='utf8').write(head + '\n' + part + '\n' + tail)
for x in subs: print(x)
