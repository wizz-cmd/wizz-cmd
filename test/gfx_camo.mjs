// GFX figure/ground (FIXPLAN §2 G9): node test/gfx_camo.mjs [--json out.json]
// For each of the 30 tile looks (real LEVELS maps) and each player / enemy sprite (normal + angry): the share of the
// sprite's body pixels (darkest 30 % = outline/shade dropped) lying within dE76 < 14 of ANY colour that covers > 1.5 % of
// the tile art. Same metric as test/qa_visual_camo.mjs, but runs against src/ via test/gfx_sheet.html (no build needed).
// Wave 3 (FIXPLAN2 K5): every ENEMY sprite (all frames of _move / _angry plus the action poses crabbit_throw, springle_squash, glimmer_fire and
// their _angry twins; the value of a sprite is the worst frame) must stay <= 0.15 on every one of the 30 rounds.
// Gates: p1 on round 1 <= 0.25; no sprite above 0.55 on any round; mean over all sprites and rounds <= 0.20; every enemy sprite <= 0.15 everywhere.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const levelsSrc = fs.readFileSync(path.join(PROJECT, 'src', '30_levels.js'), 'utf8');
await t.page.evaluate((src) => { window.__LV = new Function(src + '\n; return LEVELS;')(); }, levelsSrc);
const res = await t.page.evaluate(() => {
  const LEVELS = window.__LV;
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const spritePx = (name, frame) => {
    const sz = GFX.size(name); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true });
    GFX.draw(x, name, frame, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data; const px = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
    const L = px.map((p) => lab(...p)[0]); const sorted = [...L].sort((a, b) => a - b); const cut = sorted[Math.floor(sorted.length * 0.3)];
    return px.filter((p, i) => L[i] > cut).map((p) => lab(...p));
  };
  const enemies = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const poses = ['crabbit_throw', 'springle_squash', 'glimmer_fire'];
  const sprites = ['p1_idle', 'p2_idle'];
  const frameSets = { p1_idle: [0], p2_idle: [0] };
  for (const e of enemies) for (const sfx of ['_move', '_angry']) { const n = e + sfx; sprites.push(n); frameSets[n] = Array.from({ length: GFX.frames(n) }, (_, i) => i); }
  for (const n of poses) for (const nm of [n, n + '_angry']) if (GFX.has(nm)) { sprites.push(nm); frameSets[nm] = [0]; }
  const isEnemy = (s) => !/^p[12]_/.test(s);
  const sp = {}; for (const s of sprites) sp[s] = frameSets[s].map((f) => spritePx(s, f));
  const tilePal = (r) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(GFX.levelCanvas(r, LEVELS[r].map), 0, 0); const d = x.getImageData(0, 0, 256, 208).data; const cnt = new Map();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const tot = [...cnt.values()].reduce((a, b) => a + b, 0);
    return [...cnt.entries()].filter(([, n]) => n / tot > 0.015).map(([k]) => lab(...k.split(',').map(Number)));
  };
  const camo = {};
  for (let r = 0; r < 30; r++) { const pal = tilePal(r); camo[r + 1] = {}; for (const s of sprites) { let worst = 0; for (const px of sp[s]) { let near = 0; for (const p of px) { let m = 1e9; for (const q of pal) m = Math.min(m, dE(p, q)); if (m < 14) near++; } worst = Math.max(worst, near / px.length); } camo[r + 1][s] = +worst.toFixed(2); } }
  camo.__enemies = sprites.filter(isEnemy);
  return camo;
});
const enemySprites = res.__enemies; delete res.__enemies;
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
const rows = []; let sum = 0, n = 0;
for (const [r, o] of Object.entries(res)) for (const [s, f] of Object.entries(o)) { rows.push([+r, s, f]); sum += f; n++; }
rows.sort((a, b) => b[2] - a[2]);
console.log('worst 14 (round, sprite, share of body px within dE14 of a tile colour):');
for (const x of rows.slice(0, 14)) console.log('  ' + x.join('  '));
const avg = {}; for (const [, s, f] of rows) avg[s] = (avg[s] || 0) + f / 30;
console.log('avg per sprite', JSON.stringify(Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, +v.toFixed(2)]))));
const mean = sum / n, max = rows[0][2], p1r1 = res[1].p1_idle;
let failed = 0; const check = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!ok) failed++; };
check('Fizz on round 1 <= 0.25', p1r1 <= 0.25, 'got ' + p1r1);
check('no sprite above 0.55 on any round', max <= 0.55, 'max ' + max + ' (' + rows[0].join(' ') + ')');
check('mean camouflage <= 0.20', mean <= 0.2, 'mean ' + mean.toFixed(3));
const worstEnemy = rows.filter((x) => enemySprites.includes(x[1]))[0];
check('every enemy sprite (all frames + action poses, normal + angry) <= 0.15 on every round', worstEnemy[2] <= 0.15, 'worst ' + worstEnemy.join(' '));
console.log('errors', t.errors);
await t.close();
process.exit(failed || t.errors.length ? 1 : 0);
