# يبني الإعلان: بيحط الأيقونات جوا الصفحة وبينسخ الصور والخطوط لمجلد الرندر.
# python3 -I marketing/video/ad60/build.py <outdir> <shotsdir>
import json, re, shutil, sys, pathlib
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
out, shots = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
icons = {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="([a-z0-9-]+)"[^>]*>(.*?)</symbol>', (pathlib.Path('/home/user/mizan-updates/assets/img/icons.svg')).read_text(encoding='utf-8'), re.S)}
svg = lambda n: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{icons[n]}</svg>'
s = (D / 'src.html').read_text(encoding='utf-8')
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
need = ['pill', 'shirt', 'car', 'brick-wall', 'beef', 'croissant', 'truck', 'stethoscope', 'store', 'ice-cream', 'shopping-cart', 'utensils', 'scissors', 'smartphone']
s = s.replace('__ICONS__', json.dumps({n: svg(n) for n in need}, ensure_ascii=False))
(out / 'index.html').write_text(s, encoding='utf-8')
(out / 'fonts').mkdir(exist_ok=True)
for f in pathlib.Path('/home/user/mizan-updates/assets/fonts').glob('cairo-*.woff2'):
    shutil.copy(f, out / 'fonts' / f.name)
shutil.copy(ROOT / 'build/icon.png', out / 'logo.png')
if (out / 'shots').resolve() != shots.resolve():
    shutil.copytree(shots, out / 'shots', dirs_exist_ok=True)
qr = pathlib.Path('/tmp/claude-0/-home-user/5a5804ec-520c-5df7-bbd5-2b905021c9ac/scratchpad/wazn-pdf/qr.svg')
shutil.copy(qr, out / 'qr.svg')
print('built', out)
