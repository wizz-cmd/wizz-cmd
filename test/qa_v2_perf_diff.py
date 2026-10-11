import sys
from PIL import Image, ImageChops
import numpy as np
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size:
    print('size differs', a.size, b.size); b = b.resize(a.size)
A = np.asarray(a).astype(float); B = np.asarray(b).astype(float)
d = np.abs(A - B)
print('mean abs diff %.3f /255  p99 %.1f  max %d  pixels>16: %.3f%%  >48: %.4f%%' % (d.mean(), np.percentile(d, 99), d.max(), (d.max(axis=2) > 16).mean() * 100, (d.max(axis=2) > 48).mean() * 100))
out = sys.argv[3] if len(sys.argv) > 3 else None
if out:
    amp = np.clip(d * 6, 0, 255).astype(np.uint8)
    w, h = a.size
    canvas = Image.new('RGB', (w * 3, h))
    canvas.paste(a, (0, 0)); canvas.paste(b, (w, 0)); canvas.paste(Image.fromarray(amp), (2 * w, 0))
    canvas.save(out)
