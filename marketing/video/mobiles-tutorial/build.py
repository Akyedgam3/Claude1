import re, os, json
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
ST = json.load(open(os.path.join(D, 'assets/shots/states.json'), encoding='utf8'))
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    return re.sub(r'<!--.*?-->', '', t, flags=re.S).replace('width="24"', '').replace('height="24"', '').strip()
CH = [[22.1, 'أولاً', 'التجهيز', 25.0], [48.9, 'تانياً', 'إضافة جهاز', 51.8], [99.2, 'تالتاً', 'الشراء بالـ IMEI', 101.8],
      [125.7, 'رابعاً', 'البيع والكفالة', 127.6], [148.9, 'خامساً', 'سجل الأجهزة', 151.5], [177.2, 'سادساً', 'التقسيط', 179.6],
      [234.9, 'سابعاً', 'البيع مع استبدال', 237.8], [271.0, 'تامناً', 'تجميعة كمبيوتر', 273.6], [300.0, 'تاسعاً', 'الصيانة', 302.3]]
# مربعات يدوية
ST['dash_end']['rep'] = dict(zip('xywh', [694, 515, 648, 180]))
ST['stock']['used'] = dict(zip('xywh', [43, 118, 1299, 34]))
ST['repair_deliver']['modal2'] = ST['repair_deliver']['modal']
# [الوقت، اللقطة، التكبير على، تأشيرات، [كبسة، وقتها]]
BEATS = [
  [25.0, 'new_company', 'act', ['act'], None],
  [29.6, 'items', None, [], None],
  [31.5, 'items', [43, 134, 1299, 420], [], None],
  [38.0, 'dash', [1300, 180, 300, 320], ['g1'], None],
  [42.0, 'dash', [1300, 180, 300, 320], ['g1', 'g2'], None],
  [51.8, 'items', None, ['add'], ['add', 53.6]],
  [55.8, 'item_new', [410, 150, 780, 350], ['name'], None],
  [61.6, 'item_new', [410, 150, 780, 350], ['cat'], None],
  [63.8, 'item_new', [410, 480, 780, 330], ['specs'], None],
  [68.0, 'item_new', [410, 480, 780, 330], ['specs', 'spec2'], None],
  [73.2, 'item_laptop', [410, 460, 780, 330], ['specs'], None],
  [76.8, 'item_laptop', [410, 460, 780, 330], ['gpu'], None],
  [80.0, 'item_track', 'modal', ['track'], None],
  [88.4, 'item_track', 'modal', ['war'], None],
  [94.2, 'items', [43, 134, 1299, 420], ['sn'], None],
  [101.8, 'purchase', [45, 80, 1290, 450], ['party'], None],
  [104.0, 'purchase', [45, 200, 1290, 330], ['lines'], None],
  [106.6, 'purchase', 'ser', ['ser'], None],
  [114.6, 'purchase_err', [24, 640, 900, 360], ['toast'], None],
  [121.1, 'purchase', [45, 200, 1290, 330], ['lines'], None],
  [127.6, 'pos', None, ['scan'], ['scan', 128.0]],
  [132.0, 'pos', [28, 20, 600, 400], ['imei'], None],
  [134.9, 'pos', [28, 20, 600, 400], ['cart'], None],
  [138.5, 'pos', [28, 560, 600, 380], ['pay'], ['pay', 140.0]],
  [141.3, 'invoice', 'doc', ['line'], None],
  [143.8, 'invoice', 'doc', ['war'], None],
  [151.5, 'lookup_typed', 'search', ['search'], None],
  [156.2, 'lookup', 'card', ['search'], None],
  [158.8, 'lookup', 'card', ['card'], None],
  [161.5, 'lookup', 'card', ['events'], None],
  [165.7, 'lookup', 'card', ['status'], None],
  [168.1, 'lookup', 'card', ['events'], None],
  [171.1, 'stock', None, ['list'], None],
  [179.6, 'pos', [28, 560, 600, 380], ['pay'], None],
  [186.3, 'inst', None, ['add'], ['add', 188.6]],
  [191.1, 'inst_new', [440, 380, 720, 240], ['amount'], None],
  [194.4, 'inst_new', [440, 380, 720, 240], ['markup'], None],
  [196.4, 'inst_new', [440, 380, 720, 240], ['count'], None],
  [198.8, 'inst_new', [440, 560, 720, 200], ['guar'], None],
  [203.0, 'inst_new', [440, 640, 720, 180], ['strip'], None],
  [207.0, 'inst_new', [440, 640, 720, 180], ['create'], ['create', 208.6]],
  [210.0, 'inst_plan', None, ['print'], None],
  [215.0, 'inst_plan', [28, 78, 1300, 520], ['collect'], ['qbtn', 219.6]],
  [221.0, 'inst', [28, 70, 1314, 270], ['stats'], None],
  [225.1, 'inst', [28, 70, 1314, 270], ['late'], None],
  [228.2, 'inst_plan', None, ['wa'], ['wa', 229.6]],
  [241.6, 'trade', None, [], None],
  [243.8, 'trade', 'neu', ['neu'], None],
  [247.2, 'trade', 'old', ['old'], None],
  [259.8, 'trade_sum', [60, 700, 1265, 280], ['strip'], None],
  [262.8, 'trade_sum', [60, 700, 1265, 280], ['go'], ['go', 264.4]],
  [266.0, 'stock', [43, 36, 1299, 300], ['used'], None],
  [273.6, 'build', None, [], None],
  [280.0, 'build', 'table', ['table'], None],
  [284.2, 'build', 'table', ['gpu'], None],
  [290.6, 'build_sum', [60, 760, 1265, 200], ['fee'], None],
  [293.4, 'build_sum', [60, 760, 1265, 200], ['strip'], None],
  [302.3, 'repairs', [28, 0, 760, 230], ['add'], ['add', 307.0]],
  [308.4, 'device_new', 'modal', ['modal'], None],
  [312.7, 'repair_new', [45, 80, 1300, 380], ['dev'], None],
  [314.0, 'repair_new', [45, 80, 1300, 380], ['tech'], None],
  [315.6, 'repair_new', [45, 80, 1300, 380], ['comp'], None],
  [322.9, 'repair_work', [28, 440, 1314, 400], ['diag'], None],
  [325.9, 'repair_work', [28, 440, 1314, 400], ['parts'], None],
  [328.0, 'repair_work', [28, 440, 1314, 400], ['labor'], None],
  [329.4, 'repair_work', [45, 80, 1300, 300], ['status'], None],
  [333.4, 'repair_deliver', 'modal', ['modal'], None],
  [337.4, 'repair_deliver', 'modal', ['paid'], ['go', 340.4]],
  [342.5, 'dash_end', [28, 190, 1314, 520], ['rep'], None],
]
OVER = [['#scanP', 109.6, 114.6], ['#scanP2', 128.3, 131.8], ['#wa', 230.4, 234.9], ['#swap', 237.9, 241.6], ['#ticket', 320.3, 322.9]]
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
