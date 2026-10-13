import re, os
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    return t.replace('width="24"', '').replace('height="24"', '').strip()
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('built')
