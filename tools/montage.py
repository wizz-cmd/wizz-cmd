#!/usr/bin/env python3
"""montage.py out.png in1.png in2.png [...] [--cols N]  -- tile PNGs left to right (review helper for out/wave2/shots)."""
import sys
from PIL import Image
args = sys.argv[1:]
cols = 2
if '--cols' in args:
    i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], args[1:]
ims = [Image.open(f).convert('RGB') for f in files]
w = max(i.width for i in ims); h = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6), (40, 40, 40))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * (w + 6), (k // cols) * (h + 6)))
sheet.save(out)
