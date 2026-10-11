// GFX figure/ground (FIXPLAN §2 G9, FIXPLAN2 K5): node test/gfx_camo.mjs [--json out.json]
// v2.0 RE-BASE for the "Abyss Glow" look (SPEC_V2 section 2 "every enemy must stay distinct on every theme" + section 7). Same intent as the pixel-era gate
// (no creature may melt into the level art) measured on the new look: creatures are luminous contours (white-hot core + coloured halo) around dark
// translucent bodies, platforms are glowing crystal slabs, so the question is about the CONTOUR: the brightest quarter of the sprite's lit pixels (alpha > 0.5).
// For each of the 30 rounds (real LEVELS maps, real bg + level canvases at k = 2) and each creature frame (players, 5 enemies calm + angry, the three action poses
// and their angry twins) the sprite is composited (source-over, like Game) at the worst of: standing on the three longest platform tops, in open water.
// "Camouflaged" = a contour pixel whose composite colour is within dE76 < 25 of the backdrop colour it sits on (it adds no clearly visible difference; v1 used < 14 on opaque palette colours).
// Gates (same numbers as v1): Fizz on round 1 <= 0.25; no sprite above 0.55 on any round; mean over all sprites and rounds <= 0.20;
// every ENEMY sprite (all frames, value = worst frame/position) <= 0.15 on every one of the 30 rounds.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const levelsSrc = fs.readFileSync(path.join(PROJECT, 'src', '30_levels.js'), 'utf8');
await t.page.evaluate((src) => { window.__LV = new Function(src + '\n; return LEVELS;')(); }, levelsSrc);
const res = await t.page.evaluate(() => {
  const LEVELS = window.__LV; const K = 2; GFX.setScale(K);
  const lin = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
  const lab = (r, g, b) => { const R = lin(r), G = lin(g), B = lin(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const M = 10, DE = 25;        // v1 used dE76 < 14 on opaque palette colours; the v2 contour is white-hot, so "invisible" is judged at the stricter dE76 < 25
  const enemies = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const poses = ['crabbit_throw', 'springle_squash', 'glimmer_fire'];
  const sprites = ['p1_idle', 'p1_walk', 'p2_idle', 'p2_walk'];
  for (const e of enemies) for (const sfx of ['_move', '_angry']) sprites.push(e + sfx);
  for (const n of poses) for (const nm of [n, n + '_angry']) if (GFX.has(nm)) sprites.push(nm);
  const isEnemy = (s) => !/^p[12]_/.test(s);
  // contour pixels of every sprite frame, rendered alone at k (cached across rounds): [x, y, r, g, b, a]
  const frames = {};
  for (const s of sprites) {
    const sz = GFX.size(s); frames[s] = [];
    for (let f = 0; f < GFX.frames(s); f++) {
      const c = document.createElement('canvas'); c.width = (sz.w + 2 * M) * K; c.height = (sz.h + 2 * M) * K; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(K, 0, 0, K, 0, 0); GFX.draw(g, s, f, M, M);
      const d = g.getImageData(0, 0, c.width, c.height).data; const px = [];
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i + 3] > 128) px.push([x, y, d[i], d[i + 1], d[i + 2], d[i + 3] / 255, lab(d[i], d[i + 1], d[i + 2])[0]]); }
      const Ls = px.map((p) => p[6]).sort((a, b) => b - a); const cut = Ls[Math.max(0, (Ls.length >> 2) - 1)];
      frames[s].push({ w: c.width, h: c.height, box: sz, px: px.filter((p) => p[6] >= cut) });
    }
  }
  const platformSpots = (map) => {                         // longest runs of platform top surfaces: [{row, c0, c1}]
    const runs = [];
    for (let r = 1; r < map.length; r++) { let c = 0; while (c < 32) { const top = (cc) => map[r][cc] === '#' && map[r - 1][cc] !== '#'; if (top(c)) { let e = c; while (e + 1 < 32 && top(e + 1)) e++; if (c > 1 && e < 30 || e - c >= 3) runs.push({ row: r, c0: c, c1: e }); c = e + 1; } else c++; } }
    return runs.sort((a, b) => (b.c1 - b.c0) - (a.c1 - a.c0)).slice(0, 3);
  };
  const camo = {}; let worstCase = null;
  for (let r = 0; r < 30; r++) {
    const map = LEVELS[r].map, W = 256 * K, H = 208 * K;
    const bc = document.createElement('canvas'); bc.width = W; bc.height = H; const bg = bc.getContext('2d', { willReadFrequently: true });
    bg.drawImage(GFX.bgCanvas(r), 0, 0, W, H); bg.drawImage(GFX.levelCanvas(r, map), 0, 0, W, H);
    const bd = bg.getImageData(0, 0, W, H).data;
    const spots = platformSpots(map);
    camo[r + 1] = {};
    for (const s of sprites) {
      let worst = 0;
      for (const fr of frames[s]) {
        const pos = spots.map((sp) => [((sp.c0 + sp.c1 + 1) / 2) * 8 - fr.box.w / 2, sp.row * 8 - fr.box.h]);
        pos.push([120, 96]);                                                                   // open water, arena centre
        for (const [bx, by] of pos) {
          let near = 0, n = 0;
          for (const p of fr.px) {
            const X = Math.round(bx * K) + p[0] - M * K, Y = Math.round(by * K) + p[1] - M * K; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
            const i = (Y * W + X) * 4, a = p[5];
            const comp = [p[2] * a + bd[i] * (1 - a), p[3] * a + bd[i + 1] * (1 - a), p[4] * a + bd[i + 2] * (1 - a)];
            n++; if (dE(lab(...comp), lab(bd[i], bd[i + 1], bd[i + 2])) < DE) near++;
          }
          const share = n ? near / n : 0; if (share > worst) { worst = share; if (!worstCase || share > worstCase.v) worstCase = { v: +share.toFixed(3), round: r + 1, sprite: s, at: [Math.round(bx), Math.round(by)] }; }
        }
      }
      camo[r + 1][s] = +worst.toFixed(2);
    }
  }
  camo.__enemies = sprites.filter(isEnemy); camo.__worst = worstCase;
  return camo;
});
const enemySprites = res.__enemies; delete res.__enemies; const worstCase = res.__worst; delete res.__worst;
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
const rows = []; let sum = 0, n = 0;
for (const [r, o] of Object.entries(res)) for (const [s, f] of Object.entries(o)) { rows.push([+r, s, f]); sum += f; n++; }
rows.sort((a, b) => b[2] - a[2]);
console.log('worst 14 (round, sprite, share of contour px within dE25 of the backdrop):');
for (const x of rows.slice(0, 14)) console.log('  ' + x.join('  '));
const avg = {}; for (const [, s, f] of rows) avg[s] = (avg[s] || 0) + f / 30;
console.log('avg per sprite', JSON.stringify(Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, +v.toFixed(2)]))));
console.log('worst single placement', JSON.stringify(worstCase));
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
