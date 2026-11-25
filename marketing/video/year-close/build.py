# يبني صفحة رندر فيديو «تسكير السنة» (عمودي 1080×1920).
# python3 -I marketing/video/year-close/build.py <shots dir> <outdir>
import json, shutil, sys, pathlib
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[2]
SITE = pathlib.Path('/workspace/mizan-updates')
shots, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
svg = lambda body: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
ICONS = {
    '__I_TROPHY__': svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
    '__I_ZERO__': svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    '__I_LOCK__': svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    '__I_CHECK__': svg('<path d="M20 6 9 17l-5-5"/>'),
    '__I_ALERT__': svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
}
s = (D / 'src.html').read_text(encoding='utf-8')
for k, v in ICONS.items(): s = s.replace(k, v)
s = s.replace('__ALIGN__', '[]').replace('__BOXES__', (shots / 'boxes.json').read_text(encoding='utf-8'))
(out / 'index.html').write_text(s, encoding='utf-8')
(out / 'fonts').mkdir(exist_ok=True)
for f in (SITE / 'assets/fonts').glob('cairo-*.woff2'): shutil.copy(f, out / 'fonts' / f.name)
shutil.copy(ROOT / 'build/icon.png', out / 'logo.png')
(out / 'shots').mkdir(exist_ok=True)
for f in shots.glob('*.png'): shutil.copy(f, out / 'shots' / f.name)
print('built', out)
