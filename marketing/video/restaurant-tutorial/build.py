import re, os, json
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
ST = json.load(open(os.path.join(D, 'assets/shots/states.json'), encoding='utf8'))
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    return re.sub(r'<!--.*?-->', '', t, flags=re.S).replace('width="24"', '').replace('height="24"', '').strip()
CH = [[19.0, 'أولاً', 'تجهيز المطعم', 22.0], [81.0, 'تانياً', 'الأصناف بمكوّناتها', 84.0], [117.9, 'تالتاً', 'طلب طاولة', 120.2],
      [176.8, 'رابعاً', 'شاشة المطبخ', 179.5], [215.3, 'خامساً', 'السفري والتوصيل', 217.8], [238.3, 'سادساً', 'نقل ودمج الطاولات', 241.8],
      [264.0, 'سابعاً', 'الحساب', 267.0], [302.0, 'تامناً', 'آخر الليل', 305.6]]
DAILY_SALES = [1000, 380, 340, 110]; DAILY_TOP = [44, 221, 1296, 90]; INCOME_PROFIT = [28, 221, 430, 90]
# [الوقت، اللقطة، التكبير على، تأشيرات، [كبسة، وقتها]]
BEATS = [
  [22.0, 'new_company', 'act', ['act'], None],
  [28.7, 'dash', None, [], ['navTables', 30.1]],
  [31.0, 'tables', None, [], None],
  [31.9, 'tables', 'areas', ['areas'], None],
  [36.0, 'tables', 'hall', ['hall'], None],
  [38.4, 'add_table', 'form', ['input'], None],
  [41.0, 'add_table', 'form', ['add'], ['add', 42.1]],
  [43.0, 'add_table', 'form', ['input'], None],
  [46.6, 'add_group', 'form', ['form'], None],
  [51.2, 'add_group', 'form', ['count'], ['add', 53.6]],
  [55.1, 'tables', 'stats', ['stats'], None],
  [62.4, 'items', None, [], ['add', 65.2]],
  [66.0, 'item_new', 'modal', ['name'], None],
  [70.0, 'item_price', 'modal', ['price'], None],
  [71.0, 'item_new', 'modal', ['cat'], None],
  [75.0, 'order_empty', 'cats', ['cats'], None],
  [84.0, 'item_recipe', 'modal', [], None],
  [89.0, 'item_recipe', 'modal', ['recipe'], None],
  [100.0, 'item_recipe', 'recipe', ['recipe'], None],
  [112.0, 'items', None, [], None],
  [120.2, 'tables', None, [], None],
  [123.0, 'tables', 'hall', ['t2'], ['t2', 125.4]],
  [127.0, 'order_empty', None, ['items'], None],
  [130.0, 'order_empty', None, ['cart'], None],
  [132.0, 'order_items', None, ['tile'], ['tile', 133.4]],
  [135.0, 'order_items', 'cart', ['cart'], None],
  [137.0, 'order_full', 'notes', ['notes'], None],
  [145.5, 'order_full', 'info', ['info'], None],
  [149.4, 'order_full', 'totals', ['service'], None],
  [155.0, 'order_full', None, ['kitchen'], ['kitchen', 156.3]],
  [157.6, 'order_sent', 'cart', ['cart'], None],
  [168.8, 'tables_busy', None, [], None],
  [170.6, 'tables_busy', 'hall' if False else [800, 250, 560, 200], ['t2'], None],
  [179.5, 'kitchen', None, [], None],
  [184.8, 'kitchen', 'grid', ['grid'], None],
  [188.0, 'kitchen', 't2', ['t2'], None],
  [195.0, 'kitchen', 't2', ['line'], None],
  [200.2, 'kitchen', 't2', ['done'], ['done', 201.6]],
  [204.2, 'tables_ready', [800, 250, 560, 200], ['t2'], None],
  [217.8, 'tables', None, ['takeaway'], ['takeaway', 219.6]],
  [220.5, 'takeaway', None, ['cart'], None],
  [224.2, 'tables', None, ['delivery'], ['delivery', 225.6]],
  [226.3, 'delivery', 'info', ['info'], None],
  [230.3, 'delivery', None, ['fee'], None],
  [234.3, 'tables_open', 'open', ['open'], None],
  [242.3, 'tables', None, [], None],
  [247.0, 'order_full', None, ['move'], ['move', 249.0]],
  [250.0, 'move', 'modal', [], None],
  [254.0, 'order_full', None, ['merge'], ['merge', 259.4]],
  [260.0, 'merge', 'modal', [], None],
  [267.0, 'order_full', None, ['bill'], ['bill', 270.4]],
  [275.2, 'close', [40, 560, 560, 400], ['close'], None],
  [279.0, 'close', [40, 560, 560, 400], ['modes'], None],
  [281.8, 'close', [40, 560, 560, 400], ['kv'], None],
  [290.0, 'close', [40, 560, 560, 400], ['totals'], None],
  [306.0, 'daily', None, [], None],
  [310.0, 'daily', [700, 220, 640, 430], [], None],
  [324.0, 'income', None, [], None],
  [327.0, 'income', INCOME_PROFIT, [], None],
]
# مربعات إضافية بالتقارير
ST['daily']['sales'] = dict(zip('xywh', [1040, 385, 295, 34])); ST['income']['profit'] = dict(zip('xywh', INCOME_PROFIT))
BEATS[[b[0] for b in BEATS].index(310.0)][3] = ['sales']; BEATS[[b[0] for b in BEATS].index(327.0)][3] = ['profit']
OVER = [['#lan', 208.1, 215.0], ['#cur', 299.0, 302.0]]
shots = sorted({b[1] for b in BEATS})
SH = ''.join(f'<img class="shot" id="shot_{n}" src="assets/shots/{n}.png" />' for n in shots)
HL = ''
for n in shots:
    for k, bb in ST.get(n, {}).items():
        HL += f'<div class="hl" id="hl_{n}_{k}" style="left:{bb["x"]-8}px;top:{bb["y"]-8}px;width:{bb["w"]+16}px;height:{bb["h"]+16}px"></div>'
PROG = ''.join(f'<div>{c[2]}</div>' for c in CH) + '<div>الخلاصة</div>'
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
for k, v in {'{{STATES}}': json.dumps(ST, ensure_ascii=False), '{{CH}}': json.dumps(CH, ensure_ascii=False), '{{BEATS}}': json.dumps(BEATS, ensure_ascii=False), '{{OVER}}': json.dumps(OVER), '{{SHOTS}}': SH, '{{HLS}}': HL, '{{PROG}}': PROG}.items():
    s = s.replace(k, v)
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('built', len(BEATS), 'beats')
