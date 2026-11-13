# يبني صفحة الرندر لفيديو شرح الكمبيوتر: الأيقونات والمحاذاة واللقطات  والخطوط.
# python3 -I marketing/video/guide-07/build.py <outdir> <shotsdir> <align.json>
import json, re, shutil, sys, pathlib
from PIL import Image
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
out, shots, align = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
icons = {m.group(1): m.group(2) for m in re.finditer(r'<symbol id="([a-z0-9-]+)"[^>]*>(.*?)</symbol>', pathlib.Path('/home/user/mizan-updates/assets/img/icons.svg').read_text(encoding='utf-8'), re.S)}
# أيقونات إضافية للحلقة (lucide)
icons.update({
    'wifi': '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'share': '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
    'power': '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    'home': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
})
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
