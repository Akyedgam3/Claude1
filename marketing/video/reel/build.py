import re, os, sys
D = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(D, 'src.html'), encoding='utf8').read()
def svg(n):
    t = open(os.path.join(D, 'assets/icons', n + '.svg'), encoding='utf8').read()
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    return t.replace('width="24"', '').replace('height="24"', '').strip()
s = re.sub(r'\{\{icon:([a-z0-9-]+)\}\}', lambda m: svg(m.group(1)), s)
IM = {'r_tables': '03_r_tables', 'r_kitchen': '07_r_kitchen', 't_plan': '13_t_plan', 't_account': '18_t_account', 'm_device': '22_m_device', 'm_inst': '26_m_inst', 'invoice': '17_invoice', 'items': '13_items_saved', 'account2': '18_t_account', 'reports': '24_reports'}
s = s.replace('{{images}}', ''.join(f'<img data-k="{k}" src="shots/{v}.png" />' for k, v in IM.items()))
open(os.path.join(D, 'index.html'), 'w', encoding='utf8').write(s)
print('built')
