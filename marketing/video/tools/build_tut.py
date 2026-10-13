import re, sys, os, json
D = sys.argv[1]
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
def svg(name):
    p = os.path.join(D, 'assets/icons', name + '.svg')
    t = open(p, encoding='utf8').read()
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    return t.replace('width="24"', '').replace('height="24"', '').strip()
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
states = json.load(open(os.path.join(D, 'shots/states.json'), encoding='utf8'))
s = s.replace('{{states}}', json.dumps(states, ensure_ascii=False))
s = s.replace('{{images}}', '\n'.join(f'<img class="st" id="img_{st["name"]}" src="shots/{st["file"]}" />' for st in states))
icons = {f[:-4]: svg(f[:-4]) for f in os.listdir(os.path.join(D, 'assets/icons'))}
s = s.replace('{{iconmap}}', json.dumps(icons, ensure_ascii=False))
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('built')
