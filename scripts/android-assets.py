# يولّد أيقونات تطبيق أندرويد وشاشة البداية من build/icon.png (أيقونة وزن).
# الاستعمال: python3 scripts/android-assets.py
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
GREEN = (16, 98, 84)  # لون مربع الأيقونة
icon = Image.open(os.path.join(ROOT, 'build', 'icon.png')).convert('RGBA')

# الأيقونة الكاملة على خلفية خضرا مربعة (للأيقونة المتكيّفة: أندرويد بيقص الزوايا على شكل الجوال)
full = Image.new('RGBA', icon.size, GREEN + (255,))
full.alpha_composite(icon)

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in DENS.items():
    folder = os.path.join(RES, f'mipmap-{d}')
    os.makedirs(folder, exist_ok=True)
    s = round(48 * k)
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
    # الدائرية: نفس المربع مقصوص دائرة
    sq = full.resize((s, s), Image.LANCZOS)
    mask = Image.new('L', (s * 4, s * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    sq.putalpha(mask.resize((s, s), Image.LANCZOS))
    sq.save(os.path.join(folder, 'ic_launcher_round.png'))
    # الواجهة الأمامية للأيقونة المتكيّفة: 108dp، والجزء الظاهر الوسط 72dp (الكلمة والنقطتين جوّاه)
    f = round(108 * k)
    full.resize((f, f), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_foreground.png'))

with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#106254</color>\n</resources>\n')

# شاشة البداية: الأيقونة بالنص على أخضر غامق
SPLASH_BG = (18, 48, 43, 255)
for folder in os.listdir(RES):
    path = os.path.join(RES, folder, 'splash.png')
    if not os.path.exists(path):
        continue
    w, h = Image.open(path).size
    img = Image.new('RGBA', (w, h), SPLASH_BG)
    s = round(min(w, h) * 0.32)
    img.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    img.convert('RGB').save(path)
print('ok')
