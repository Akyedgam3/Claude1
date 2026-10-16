import re, os, json
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
ST = json.load(open(os.path.join(D, 'assets/shots/states.json'), encoding='utf8'))
XL = json.load(open(os.path.join(D, 'assets/shots/excel.json'), encoding='utf8'))
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    return re.sub(r'<!--.*?-->', '', t, flags=re.S).replace('width="24"', '').replace('height="24"', '').strip()
DUR = 304.5
CH = [[22.8, 'أولاً', 'التجهيز', 24.8], [44.4, 'تانياً', 'إضافة صنف', 46.9], [80.8, 'تالتاً', 'من الإكسل بكبسة', 82.6],
      [120.3, 'رابعاً', 'المواد بالوزن', 123.3], [145.9, 'خامساً', 'تواريخ الصلاحية', 148.7], [175.3, 'سادساً', 'الشراء', 177.8],
      [195.6, 'سابعاً', 'الكاشير', 197.6], [224.4, 'تامناً', 'ديون الزباين', 227.2], [243.4, 'تاسعاً', 'آخر الليل', 246.5]]
# مربعات يدوية
ST['items']['row1'] = dict(zip('xywh', [44, 177, 1298, 45]))
ST['party']['plist'] = dict(zip('xywh', [509, 170, 832, 230]))
ST['daily']['emp'] = dict(zip('xywh', [1060, 180, 220, 44]))
ST['daily']['cash'] = dict(zip('xywh', [41, 340, 1300, 340]))
ST['income']['profit'] = dict(zip('xywh', [28, 215, 430, 95]))
# [الوقت، اللقطة، التكبير، تأشيرات، [كبسة، وقتها]، فقاعة]
BEATS = [
  [24.8, 'new_company', 'act', ['act'], None, 'سوبرماركت وبقالية'],
  [29.8, 'items', [43, 60, 1299, 520], ['cats'], None, 'التصنيفات جاهزة'],
  [38.8, 'item_units', [410, 290, 780, 160], ['base'], None, 'الوحدات جاهزة'],
  [46.9, 'items', None, ['add'], ['add', 48.4], None],
  [49.0, 'item_new', [410, 300, 780, 300], ['name'], None, 'اسم الصنف'],
  [53.0, 'item_new', [410, 300, 780, 300], ['cat'], None, 'التصنيف'],
  [54.6, 'item_new', [410, 450, 780, 230], ['bc'], None, 'الباركود'],
  [60.6, 'item_units', [410, 280, 780, 220], ['base'], None, 'الوحدة الأساسية: قطعة'],
  [64.2, 'item_units', [410, 560, 780, 180], ['carton'], None, 'كرتونة = 12 قطعة'],
  [73.8, 'item_units', [410, 380, 780, 140], ['retail', 'whole'], None, 'مفرق وجملة'],
  [82.6, 'items', None, ['imp'], ['imp', 88.8], 'استيراد من Excel'],
  [101.5, 'items_after', [0, 560, 1370, 440], ['toast'], None, 'استيراد مع الكميات'],
  [105.9, 'opening0', [700, 450, 700, 220], ['all'], ['all', 110.6], 'أضف كل المواد للجدول'],
  [112.9, 'opening', [60, 560, 1265, 420], ['row'], None, 'اكتب الكمية جنب كل صنف'],
  [117.2, 'opening', [60, 560, 1265, 420], [], None, None],
  [123.3, 'item_weighed', [410, 346, 780, 309], ['w'], None, 'يُباع بالوزن'],
  [133.0, 'items', [43, 120, 1299, 260], ['row1'], None, 'رمز قصير: 101'],
  [143.8, 'pos_scale', [28, 60, 700, 450], ['cheese'], None, 'الوزن والسعر من اللزقة'],
  [148.7, 'item_expiry', [410, 346, 780, 309], ['exp'], None, 'تتبع الصلاحية'],
  [157.6, 'purchase_batch', [560, 280, 800, 180], ['exp'], None, 'تاريخ الصلاحية لكل دفعة'],
  [168.6, 'dash_alerts', [28, 380, 1314, 300], ['exp'], None, 'قرّب ينتهي'],
  [171.0, 'dash_alerts', [28, 380, 1314, 300], ['low'], None, 'قرّب يخلص'],
  [177.8, 'purchase', [60, 60, 1265, 220], ['party'], None, 'اختار المورد'],
  [182.7, 'purchase', [60, 200, 1265, 470], ['scan'], None, 'امسح الباركود'],
  [185.4, 'purchase', [60, 200, 1265, 470], ['lines'], None, 'الكمية والتكلفة'],
  [187.3, 'purchase', [40, 690, 700, 300], ['paid'], None, 'المدفوع'],
  [190.6, 'purchase', [40, 690, 700, 300], ['totals'], None, 'الباقي دين للتاجر'],
  [192.5, 'party', [480, 150, 900, 300], ['plist'], None, 'قديش عليك لكل تاجر'],
  [197.6, 'pos_empty', None, ['scan'], ['scan', 199.2], 'امسح الباركود'],
  [201.2, 'pos_scan', [28, 60, 700, 480], ['cart'], None, 'كل مسحة = صنف بالسلة'],
  [203.6, 'pos_scale', [28, 60, 700, 450], ['cheese'], None, 'الأوزان لحالها'],
  [205.7, 'pos_carton', [28, 60, 700, 450], ['chip'], ['chip', 206.9], 'كرتونة'],
  [207.4, 'pos_carton', [28, 60, 700, 450], ['carton'], None, None],
  [208.8, 'pos_pay', [28, 440, 600, 480], ['rec'], None, 'المستلم'],
  [210.6, 'pos_pay', [28, 440, 600, 480], ['change'], None, 'الباقي للزبون'],
  [212.4, 'pos_pay', [28, 440, 600, 480], ['pay'], ['pay', 213.6], None],
  [216.4, 'pos_pay', [28, 440, 600, 480], ['hold'], ['hold', 219.8], 'تعليق الفاتورة'],
  [220.6, 'pos_held', [28, 0, 600, 420], ['held'], None, 'معلّقة… بترجعلها بعدين'],
  [230.2, 'pos_credit', [28, 0, 600, 450], ['cust'], None, 'اختار الزبون'],
  [231.8, 'pos_credit', [28, 500, 600, 420], ['credit'], ['credit', 232.8], 'على الحساب'],
  [235.0, 'voucher', [28, 100, 1340, 380], ['from'], None, 'سند قبض'],
  [236.8, 'voucher', [28, 100, 1340, 380], ['amount'], None, None],
  [237.9, 'voucher_print', 'doc', [], None, None],
  [239.2, 'party', [0, 170, 520, 700], ['table'], None, 'كشف الحساب'],
  [246.5, 'daily', [41, 160, 1300, 180], [], None, None],
  [256.4, 'daily', [41, 160, 1300, 540], ['emp'], None, 'تقرير لكل كاشير'],
  [262.4, 'income', [0, 150, 1370, 300], ['profit'], None, 'ربحك الحقيقي'],
]
SCENES = [['#scBar', 55.8, 60.6], ['#scCarton', 66.0, 73.8], ['#scExcel', 89.9, 101.5], ['#scScale', 137.0, 143.8],
          ['#scExp', 162.4, 168.6], ['#scDebt', 227.2, 230.2], ['#scCash', 248.6, 256.4]]
shots = sorted({b[1] for b in BEATS})
SH = ''.join(f'<img class="shot" id="shot_{n}" src="assets/shots/{n}.png" />' for n in shots)
HL = ''
for n in shots:
    for k, bb in ST.get(n, {}).items():
        HL += f'<div class="hl" id="hl_{n}_{k}" style="left:{bb["x"]-8}px;top:{bb["y"]-8}px;width:{bb["w"]+16}px;height:{bb["h"]+16}px"></div>'
PROG = ''.join(f'<div>{c[2]}</div>' for c in CH) + '<div>الخلاصة</div>'
ICONS = ['shopping-cart', 'package', 'cup-soda', 'scan-barcode', 'receipt', 'coins', 'store', 'banknote', 'layers', 'calendar-clock']
FLOAT = ''.join(f'<span class="f icon" style="left:{60 + (i * 137) % 1800}px;top:{(i * 397) % 1000}px">{{{{icon:{ICONS[i % len(ICONS)]}}}}}</span>' for i in range(14))
DROPS = ''.join(f'<span class="drop icon">{{{{icon:{n}}}}}</span>' for n in ['package', 'cup-soda', 'coins', 'package', 'cup-soda', 'store', 'package'])
DIGITS = ''.join(f'<span class="digit mono">{d}</span>' for d in '6210001000123')
BOTTLES = ''.join('<span class="bt icon">{{icon:cup-soda}}</span>' for _ in range(12))
fmt = lambda v: f'{v:,}' if isinstance(v, int) else v
XLR = '<tr><th>' + '</th><th>'.join(XL[0]) + '</th></tr>' + ''.join('<tr class="row"><td>' + '</td><td>'.join(str(fmt(c)) for c in r) + '</td></tr>' for r in XL[1:])
MZ = ''.join(f'<div class="it">{r[0]}<span>{r[5]} {r[3]}</span></div>' for r in XL[1:])
FLY = ''.join(f'<div class="fly">{r[0]}</div>' for r in XL[1:])
COINS = ''.join(f'<span class="coin icon" style="left:{150 + i * 160}px;top:0">{{{{icon:coins}}}}</span>' for i in range(11))
SUM = ''.join(f'<div class="c"><span class="icon">{{{{icon:{i}}}}}</span><b>{t}</b></div>' for i, t in [('scan-barcode', 'الباركود'), ('package', 'الكرتونة والقطعة'), ('coins', 'الأوزان'), ('calendar-clock', 'الصلاحية'), ('shopping-cart', 'الكاشير'), ('hand-coins', 'الديون')])
for k, v in {'{{FLOATERS}}': FLOAT, '{{DROPS}}': DROPS, '{{DIGITS}}': DIGITS, '{{BOTTLES}}': BOTTLES, '{{XLROWS}}': XLR, '{{MZROWS}}': MZ, '{{FLYROWS}}': FLY, '{{COINS}}': COINS, '{{SUMCARDS}}': SUM}.items():
    s = s.replace(k, v)
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
for k, v in {'{{STATES}}': json.dumps(ST, ensure_ascii=False), '{{CH}}': json.dumps(CH, ensure_ascii=False), '{{BEATS}}': json.dumps(BEATS, ensure_ascii=False), '{{SCENES}}': json.dumps(SCENES), '{{SHOTS}}': SH, '{{HLS}}': HL, '{{PROG}}': PROG, '{{DUR}}': str(DUR)}.items():
    s = s.replace(k, v)
assert '{{' not in s, re.findall(r'\{\{[^}]+\}\}', s)[:5]
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('built', len(BEATS), 'beats')
