# يبني صفحة الرندر لفيديو شرح الكمبيوتر: الأيقونات والمحاذاة واللقطات  والخطوط.
# python3 -I marketing/video/desktop-guide/build.py <outdir> <shotsdir> <align.json>
import json, re, shutil, sys, pathlib
from PIL import Image
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
out, shots, align = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
icons = {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="([a-z0-9-]+)"[^>]*>(.*?)</symbol>', pathlib.Path('/home/user/mizan-updates/assets/img/icons.svg').read_text(encoding='utf-8'), re.S)}
svg = lambda n: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{icons[n]}</svg>'
s = (D / 'src.html').read_text(encoding='utf-8')
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
s = s.replace('__ICONS__', json.dumps({n: svg(n) for n in icons}, ensure_ascii=False))
s = s.replace('__ALIGN__', align.read_text(encoding='utf-8'))
s = s.replace('__STATES__', (shots / 'states.json').read_text(encoding='utf-8'))
s = s.replace('__FP__', json.dumps((shots / 'fp.txt').read_text().strip()))
(out / 'index.html').write_text(s, encoding='utf-8')
(out / 'fonts').mkdir(exist_ok=True)
for f in pathlib.Path('/home/user/mizan-updates/assets/fonts').glob('cairo-*.woff2'):
    shutil.copy(f, out / 'fonts' / f.name)
shutil.copy(ROOT / 'build/icon.png', out / 'logo.png')
(out / 'shots').mkdir(exist_ok=True)
for p in shots.glob('*.png'):
    dst = out / 'shots' / p.name
    if not dst.exists() or dst.stat().st_mtime < p.stat().st_mtime:
        shutil.copy(p, dst)
print('built', out)
