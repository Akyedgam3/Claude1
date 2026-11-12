import sys
from PIL import Image, ImageDraw
out, cols, *ts = sys.argv[1:]
cols = int(cols)
ims = [Image.open(f'prev/f_{t}.jpg') for t in ts]
w, h = ims[0].size
tw = 300; th = int(h * tw / w)
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (cols * (tw + 6) + 6, rows * (th + 26) + 6), '#222')
d = ImageDraw.Draw(s)
for i, (im, t) in enumerate(zip(ims, ts)):
    x = 6 + (i % cols) * (tw + 6); y = 6 + (i // cols) * (th + 26)
    s.paste(im.resize((tw, th)), (x, y)); d.text((x + 4, y + th + 4), f't={t}', fill='#fff')
s.save(out, quality=88)
