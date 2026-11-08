# يبني فيديو «أكشن موشن»: الأيقونات وعدد فريمات الشاشات المسجّلة، وبينسخ الصور والخطوط.
# python3 -I marketing/video/ad-action/build.py <outdir> <recdir> <shotsdir>
import json, re, shutil, sys, pathlib
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
out, rec, shots = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
icons = {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="([a-z0-9-]+)"[^>]*>(.*?)</symbol>', pathlib.Path('/home/user/mizan-updates/assets/img/icons.svg').read_text(encoding='utf-8'), re.S)}
svg = lambda n: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{icons[n]}</svg>'
s = (D / 'src.html').read_text(encoding='utf-8')
need = sorted(set(re.findall(r"icon\('([a-z0-9-]+)'\)", s) + re.findall(r"ICONS\['([a-z0-9-]+)'\]", s) + ['shopping-cart', 'utensils', 'pill', 'smartphone', 'shirt', 'car', 'brick-wall', 'beef', 'croissant', 'truck', 'stethoscope', 'store', 'ice-cream', 'scissors', 'chef-hat', 'monitor', 'printer', 'ruler', 'palette', 'laptop', 'layers', 'receipt', 'wallet', 'hand-coins', 'chart-column']))
s = s.replace('__ICONS__', json.dumps({n: svg(n) for n in need}, ensure_ascii=False))
counts = {d.name: len(list(d.glob('*.jpg'))) for d in sorted(rec.iterdir()) if d.is_dir()}
s = s.replace('__REC__', json.dumps(counts))
(out / 'index.html').write_text(s, encoding='utf-8')
(out / 'fonts').mkdir(exist_ok=True)
for f in pathlib.Path('/home/user/mizan-updates/assets/fonts').glob('cairo-*.woff2'):
    shutil.copy(f, out / 'fonts' / f.name)
shutil.copy(ROOT / 'build/icon.png', out / 'logo.png')
if (out / 'rec').resolve() != rec.resolve():
    shutil.copytree(rec, out / 'rec', dirs_exist_ok=True)
(out / 'shots').mkdir(exist_ok=True)
shutil.copy(shots / 'd-dashboard.png', out / 'shots' / 'd-dashboard.png')
print('built', out, counts)
