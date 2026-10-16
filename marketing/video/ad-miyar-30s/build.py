import re, os, json
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    return re.sub(r'<!--.*?-->', '', t, flags=re.S).replace('width="24"', '').replace('height="24"', '').strip()

def view(r, vw=960, vh=760):
    x, y, w, h = r
    sc = max(vw / w, vh / h)
    return [round(-x * sc), round(-y * sc), round(sc, 4)]

# [اللقطة، العنوان، الشريط، من، إلى، عمودي؟]
FEAT = [
    ('pos', 'نقطة بيع <b>سريعة</b>', 'باركود وميزان إلكتروني', (0, 40, 600, 475), (0, 470, 600, 475), False),
    ('tables', 'مطاعم <b>وطاولات</b>', 'مطبخ · سفري · توصيل', (700, 40, 680, 538), (380, 150, 560, 443), False),
    ('customer', 'شاشة <b>الزبون</b>', 'طلبه والمبلغ قدّامه', (0, 0, 1137, 900), (800, 120, 780, 617), False),
    ('receipt', 'إيصال <b>على كيفك</b>', 'شعارك · رقمك · رسالتك', (0, 0, 304, 597), (0, 89, 304, 597), True),
    ('live', 'لوحة إدارة <b>مباشرة</b>', 'كل شي عم يصير هلق', (700, 60, 680, 538), (900, 60, 450, 356), False),
    ('imei', 'موبايلات <b>وتقسيط</b>', 'IMEI · كفالة · أقساط', (600, 60, 760, 600), (900, 140, 440, 348), False),
]
html, data = '', []
for i, (shot, ttl, pill, a, b, tall) in enumerate(FEAT):
    vw, vh = (540, 1060) if tall else (960, 760)
    html += (f'<div class="sc feat" id="f{i}"><div class="num">0{i + 1} / 06</div><div class="center ttl">{ttl}</div>'
             f'<div class="dev{" tall" if tall else ""}"><div class="vp"><img src="assets/shots/{shot}.png" /></div><div class="shine"></div></div>'
             f'<div class="pill"{" style=\"top:1600px\"" if tall else ""}>{pill}</div></div>\n')
    data.append({'t': round(8.0 + i * 13.0 / 6, 3), 'from': view(a, vw, vh), 'to': view(b, vw, vh)})

ACTS = [('store', 'تجارة عامة'), ('shopping-cart', 'سوبرماركت'), ('utensils', 'مطاعم'), ('smartphone', 'موبايلات'), ('pill', 'صيدلية'), ('shirt', 'ألبسة'),
        ('car', 'قطع سيارات'), ('scissors', 'خياطة'), ('croissant', 'أفران'), ('ice-cream-cone', 'حلويات'), ('layers', 'مواد بناء'), ('package', 'جملة'),
        ('chef-hat', 'لحوم'), ('user', 'عيادات')]
icons = ''
for i, (ic, lb) in enumerate(ACTS):
    r, c = divmod(i, 4)
    n = 4 if r < 3 else 2
    left = (1080 - (n * 196 + (n - 1) * 40)) / 2 + c * 236
    icons += f'<div class="ic" style="left:{left}px;top:{470 + r * 250}px"><span class="icon">{{{{icon:{ic}}}}}</span><small>{lb}</small></div>'
DOTS = ''.join(f'<div class="dot" style="left:{(i * 173) % 1040 + 20}px;top:{(i * 331) % 1880 + 20}px"></div>' for i in range(18))
COINS = ''.join('<span class="coin icon" style="left:485px;top:845px">{{icon:coins}}</span>' for _ in range(8))
for k, v in {'{{FEATS}}': html, '{{ICONS}}': icons, '{{DOTS}}': DOTS, '{{COINS}}': COINS}.items():
    s = s.replace(k, v)
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
s = s.replace('{{FEATDATA}}', json.dumps(data))
assert '{{' not in s, re.findall(r'\{\{[^}]+\}\}', s)[:5]
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('ok', [d['t'] for d in data])
