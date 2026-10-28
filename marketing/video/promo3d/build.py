# يبني صفحة الرندر لإعلان الأنميشن ثلاثي الأبعاد: الأيقونات والخطوط والصور.
# python3 -I marketing/video/promo3d/build.py <outdir>
import re, shutil, sys, pathlib
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
SITE = pathlib.Path('/home/user/mizan-updates')
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
icons = {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="([a-z0-9-]+)"[^>]*>(.*?)</symbol>', (SITE / 'assets/img/icons.svg').read_text(encoding='utf-8'), re.S)}
svg = lambda n: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{icons[n]}</svg>'
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), (D / 'src.html').read_text(encoding='utf-8'))
(out / 'index.html').write_text(s, encoding='utf-8')
(out / 'fonts').mkdir(exist_ok=True)
for f in (SITE / 'assets/fonts').glob('cairo-*.woff2'): shutil.copy(f, out / 'fonts' / f.name)
shutil.copy(ROOT / 'build/icon.png', out / 'logo.png')
shutil.copy(SITE / 'assets/img/dashboard.webp', out / 'dashboard.webp')
print('built', out)
