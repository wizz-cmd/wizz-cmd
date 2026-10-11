# QA v2 / lens "audio" -- own spectrogram renderer (log frequency 40 Hz..12 kHz, dB colour map) with section boundaries / names and the per-bar loudness trace.
# Usage: python3 test/qa_v2_audio_spectro.py <track> [t0 t1] [tempo-suffix]   -> out/qa_v2/audio/spectro/<track>[_t0-t1].png
import sys, json, wave, numpy as np
from PIL import Image, ImageDraw, ImageFont
SR = 24000
track = sys.argv[1]; suffix = ''
t0 = float(sys.argv[2]) if len(sys.argv) > 3 else 0.0
t1 = float(sys.argv[3]) if len(sys.argv) > 3 else None
base = '/tmp/claude-0/-home-user-wizz-cmd/513fa6d7-0d66-572a-84bd-f54579a0dbcb/scratchpad/fizzpop/out/qa_v2/audio/'
info = json.load(open(base + 'secinfo.json'))[track]
w = wave.open(base + 'wav/' + track + '.wav', 'rb'); n = w.getnframes(); a = np.frombuffer(w.readframes(n), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768.0; w.close()
x = a.mean(axis=1)
dur = len(x) / SR
if t1 is None: t1 = min(dur, info['introSeconds'] + info['loopSeconds'])
x = x[int(t0 * SR): int(t1 * SR)]
N = 2048; hop = 512 if (t1 - t0) < 60 else 1024
win = np.hanning(N)
frames = (len(x) - N) // hop
S = np.empty((frames, N // 2))
for i in range(frames):
    S[i] = np.abs(np.fft.rfft(x[i * hop: i * hop + N] * win))[: N // 2]
db = 20 * np.log10(S + 1e-9)
f = np.arange(N // 2) * SR / N
H = 480; fmin, fmax = 40.0, 12000.0
rows = np.exp(np.linspace(np.log(fmax), np.log(fmin), H))  # top = high
idx = np.clip(np.searchsorted(f, rows), 0, N // 2 - 1)
img = db[:, idx].T  # H x frames
top = np.percentile(db, 99.5)
img = np.clip((img - (top - 70)) / 70.0, 0, 1)
# colour map (black-blue-purple-red-orange-yellow-white)
stops = [(0, (0, 0, 8)), (0.2, (30, 10, 90)), (0.4, (120, 20, 120)), (0.6, (210, 40, 60)), (0.8, (255, 160, 20)), (1.0, (255, 255, 200))]
def cmap(v):
    out = np.zeros(v.shape + (3,), dtype=np.uint8)
    for k in range(len(stops) - 1):
        a0, c0 = stops[k]; a1, c1 = stops[k + 1]
        m = (v >= a0) & (v <= a1)
        tt = (v[m] - a0) / (a1 - a0)
        for c in range(3): out[..., c][m] = (c0[c] + (c1[c] - c0[c]) * tt).astype(np.uint8)
    return out
rgb = cmap(img)
W = frames
im = Image.fromarray(rgb)
scale = max(1, int(1800 / W))
im = im.resize((W * scale if scale > 1 else W, H), Image.NEAREST)
if im.size[0] > 2400: im = im.resize((2400, H))
W2 = im.size[0]
canvas = Image.new('RGB', (W2 + 60, H + 70), (0, 0, 0)); canvas.paste(im, (50, 24))
d = ImageDraw.Draw(canvas)
tx = lambda t: 50 + (t - t0) / (t1 - t0) * W2
for s in info['sections']:
    if s['t1'] < t0 or s['t0'] > t1: continue
    X = tx(max(s['t0'], t0)); d.line([(X, 20), (X, H + 24)], fill=(255, 255, 255), width=1)
    d.text((X + 3, 6), '%s (%d)' % (s['name'], s['bars']), fill=(255, 255, 255))
    # bar ticks
    bl = (s['t1'] - s['t0']) / s['bars']
    for b in range(1, int(s['bars'])):
        tb = s['t0'] + b * bl
        if t0 <= tb <= t1 and (t1 - t0) < 80: d.line([(tx(tb), H + 24), (tx(tb), H + 30)], fill=(150, 150, 150))
for fr_ in (100, 250, 500, 1000, 2000, 4000, 8000):
    y = 24 + H * (np.log(fmax) - np.log(fr_)) / (np.log(fmax) - np.log(fmin)); d.line([(46, y), (50, y)], fill=(200, 200, 200)); d.text((2, y - 5), str(fr_), fill=(200, 200, 200))
d.text((52, H + 40), '%s  %.1f-%.1f s   (log frequency 40 Hz-12 kHz; colour = dB)' % (track, t0, t1), fill=(255, 255, 255))
out = base + 'spectro/' + track + ('_%d-%d' % (t0, t1) if len(sys.argv) > 3 else '') + '.png'
canvas.save(out); print(out)
