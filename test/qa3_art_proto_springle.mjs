// QA3 art proposal: Springle redrawn as an unmistakable seahorse. Renders old vs new at x8, plus 1x-on-tiles strips.
// usage: node test/qa3_art_proto_springle.mjs <design.mjs> <out-name>
import path from 'path';
import { pathToFileURL } from 'url';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const dpath = path.resolve(process.argv[2] || path.join(PROTO, 'springle_design_v1.mjs'));
const design = (await import(pathToFileURL(dpath).href)).default;
const norm = (s) => s.trim().split('\n').map((r) => r.trim());
let frames, squash;
if (design.body) {   // body10 mode: 10 head/body rows + the original spring parts (tall / med / squash)
  const body = design.body.map(norm);
  const compose = (rows, key, dy) => { const g = Array.from({ length: 16 }, () => '.'.repeat(16)); const out = g.map((r) => r.split('')); rows.forEach((row, j) => { const y = j + dy; if (y < 16) for (let x = 0; x < 16; x++) if (row[x] !== '.') out[y][x] = row[x]; }); return { out: out.map((r) => r.join('')), key }; };
  design.compose = compose; frames = body; squash = null;
} else { frames = design.frames.map(norm); squash = norm(design.squash); }
for (const g of (design.body ? [] : [...frames, squash])) { if (g.length !== 16 || g.some((r) => r.length !== 16)) { console.log('BAD GRID', g.map((r, i) => i + ':' + r.length).join(' ')); process.exit(1); } }
const t = await protoPage();
await t.page.evaluate(({ frames, squash, steam, bodyMode }) => {
  const d = GFX._dbg;
  if (bodyMode) {
    const mk = (rows, key, dy) => { let g = d.put(d.blank(16, 16), d.shiftGrid(rows.concat(Array(6).fill('.'.repeat(16))).slice(0, 16), 0, dy)); for (const [y, row] of d.SPRING_PARTS[key]) g = d.put(g, d.G(row), 0, y); return g; };
    const A = frames[0], B = frames[1] || frames[0];
    frames = [mk(A, 'tall', 0), mk(B, 'tall', 0), mk(A, 'med', 1), mk(B, 'med', 1)];
    squash = mk(A, 'squash', 2);
  }
  const fin = d.sprite('sv_move', 16, 16, d.SPRING_PAL, frames);
  d.spriteFinished('sv_angry', 16, 16, d.SPRING_ANGRY, d.addSteam(fin, steam));
  d.sprite('sv_squash', 16, 16, d.SPRING_PAL, [squash]);
}, { frames, squash, steam: design.steam || [[11, 1], [13, 3]], bodyMode: !!design.body });
const out = path.join(PROTO, (process.argv[3] || 'springle_v1') + '.png');
await canvasFnShot(t.page, out, () => {
  const Z = 12, W = 16 * Z + 8;
  const cv = document.createElement('canvas'); cv.width = 6 * W + 8; cv.height = W + 4 * 18 * 2 + 40;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  const nf = GFX.frames('sv_move');
  const layout = [['springle_move', 0], ['sv_move', 0], ['sv_move', 2 % nf], ['sv_squash', 0], ['sv_angry', 0], ['springle_angry', 0]];
  layout.forEach((c, i) => { tg.clearRect(0, 0, 16, 16); GFX.draw(tg, c[0], c[1], 0, 0); g.drawImage(tmp, 4 + i * W, 4, 16 * Z, 16 * Z); });
  // 1x on the six theme backdrops (bgCanvas), old / new / new angry, shown x4
  const mkStrip = (name) => { const s = document.createElement('canvas'); s.width = 6 * 20; s.height = 18; const sg = s.getContext('2d'); [0, 5, 10, 15, 20, 25].forEach((b, i) => { sg.drawImage(GFX.bgCanvas(b), 40, 100, 20, 18, i * 20, 0, 20, 18); GFX.draw(sg, name, i % GFX.frames(name), i * 20 + 2, 1); }); return s; };
  const y0 = W + 8;
  g.drawImage(mkStrip('springle_move'), 4, y0, 6 * 20 * 4, 72);
  g.drawImage(mkStrip('sv_move'), 4 + 6 * 20 * 4 + 16, y0, 6 * 20 * 4, 72);
  return cv;
}, { scale: 1 });
console.log('errors', t.errors);
await t.close();
