// Fizz & Pop facing legibility (FIXPLAN §2 G2): node test/gfx_players.mjs [out.png]
// For every p1_*/p2_* frame: silhouette (alpha>128) difference to its own mirror image must be >= 15 % of the opaque
// pixels (flip test); eyes sit on the front half of the face; tail/frills asymmetric. Writes a zoomed strip PNG.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const out = process.argv[2] || path.join(PROJECT, 'out/fix/gfx_players_strip.png');
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const spr = (n, f, o) => { const sz = GFX.size(n); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); GFX.draw(x, n, f, 0, 0, o); return x.getImageData(0, 0, sz.w, sz.h).data; };
  const res = {}; let min = 100;
  for (const pre of ['p1', 'p2']) for (const k of ['idle', 'walk', 'jump', 'fall', 'shoot', 'stun', 'die']) {
    const n = pre + '_' + k; const arr = [];
    for (let f = 0; f < GFX.frames(n); f++) {
      const a = spr(n, f), b = spr(n, f, { flip: true }); let op = 0, df = 0;
      for (let i = 0; i < a.length; i += 4) { const oa = a[i + 3] > 128, ob = b[i + 3] > 128; if (oa || ob) { op++; if (oa !== ob) df++; } }
      const v = +(100 * df / op).toFixed(1); arr.push(v);
      if (k !== 'die') min = Math.min(min, v);        // die = rotated pose, not a facing frame
    }
    res[n] = arr;
  }
  // wave 3: 3/4 turn - the pupil pixels (eye rows 5-6) of every facing frame sit on the leading half of the 8 px head (head centre x = 8.5)
  const eyeCol = { p1: [0x2a, 0x13, 0x47], p2: [0x23, 0x1a, 0x4d] }; let minEye = 99;
  for (const pre of ['p1', 'p2']) for (const k of ['idle', 'walk', 'jump', 'fall', 'shoot']) for (let f = 0; f < GFX.frames(pre + '_' + k); f++) {
    const a = spr(pre + '_' + k, f); let sx = 0, n = 0;
    for (let y = 5; y <= 6; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; if (a[i + 3] > 200 && a[i] === eyeCol[pre][0] && a[i + 1] === eyeCol[pre][1] && a[i + 2] === eyeCol[pre][2]) { sx += x; n++; } }
    if (n) minEye = Math.min(minEye, sx / n);
  }
  return { res, min, minEye };
});
for (const [n, a] of Object.entries(r.res)) console.log(n.padEnd(10), a.join(' / '));
check(`flip-test silhouette difference >= 15% on every facing frame (min ${r.min}%)`, r.min >= 15);
check(`eyes sit on the leading half of the face: pupil centroid x >= 9.9 on every facing frame (min ${r.minEye.toFixed(2)}; head centre 8.5)`, r.minEye >= 9.9);
// strip: every player frame at x8, row 1 = as drawn, row 2 = mirrored (what a left-facing player looks like)
await canvasFnShot(t.page, out, () => {
  const names = ['p1_idle', 'p1_walk', 'p1_jump', 'p1_fall', 'p1_shoot', 'p1_stun', 'p1_die', 'p2_idle', 'p2_walk', 'p2_jump', 'p2_fall', 'p2_shoot'];
  const Z = 6, cells = []; for (const n of names) for (let f = 0; f < GFX.frames(n); f++) cells.push([n, f]);
  const perRow = 14, rows = Math.ceil(cells.length / perRow), cw = 16 * Z + 4;
  const cv = document.createElement('canvas'); cv.width = perRow * cw; cv.height = rows * (16 * Z + 6) * 2;
  const g = cv.getContext('2d'); g.fillStyle = '#0d0b1a'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  cells.forEach(([n, f], i) => {
    for (const flip of [false, true]) {
      tg.clearRect(0, 0, 16, 16); GFX.draw(tg, n, f, 0, 0, { flip });
      g.drawImage(tmp, (i % perRow) * cw + 2, Math.floor(i / perRow) * (16 * Z + 6) * 2 + (flip ? 16 * Z + 6 : 0) + 2, 16 * Z, 16 * Z);
    }
  });
  return cv;
}, { scale: 1 });
check('zero console errors / lint clean', t.errors.length === 0 && (await t.page.evaluate(() => T.lint())).length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
