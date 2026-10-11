// FIZZ & POP v3 - cast look scenes (role "cast").   node test/v2_cast_look.mjs <scene...> [--cast=<rel path>] [--out=<dir>] [--tag=<suffix>]
// Renders review PNGs of the V3 cast fixes with the cast harness (stub or real GFX): ink (C1), specials (C5), trap (C2), kraken (V7), pearls (V8),
// players (C3), angry (C4), frozen (V1), pads (X7).  Used by the cast fixer to LOOK at every change; not a gate (the gate is v2_cast_test.mjs).
import fs from 'fs';
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = opt('out', path.join(PROJECT, 'out', 'v3', 'cast'));
const cast = opt('cast', '../src/11_gfx_cast.js');
const tag = opt('tag', '');
const scenes = args.filter((a) => !a.startsWith('--'));
if (!scenes.length) scenes.push('ink');
fs.mkdirSync(OUT, { recursive: true });
const real = scenes.some((s) => s === 'frozen' || s === 'frozen_themes');
const t = await launch({ html: path.join(PROJECT, 'test', 'v2_cast_harness.html') + '?gfx=' + (real ? 'real' : 'stub') + '&cast=' + encodeURIComponent(cast), viewport: { width: 1400, height: 900 } });
await t.page.waitForFunction(() => window.__castReady === true);
const shot = (name, fn, a, scale) => canvasFnShot(t.page, path.join(OUT, name + (tag ? '_' + tag : '') + '.png'), fn, { args: a || [], scale: scale || 1 }).then((f) => console.log('wrote', f));

for (const sc of scenes) {
  if (sc === 'ink') {
    // the ink bullet over the Kraken's lit tentacles / mantle, on the water gradient, at k = 1, 2, 4 (x4 / x2 / x1 nearest-neighbour zoom)
    for (const [k, z] of [[1, 5], [2, 3], [4, 1]]) {
      await shot('ink_over_kraken_k' + k, (k) => {
        const W = 150, H = 62;
        const items = [{ name: 'kraken', f: 0, x: 0, y: 8 }, { name: 'kraken_angry', f: 1, x: 50, y: 8 }];
        const bul = [[20, 28], [26, 40], [12, 44], [16, 50], [34, 54], [8, 30], [72, 30], [78, 42], [62, 44], [66, 52], [88, 54], [56, 30]];
        for (const [x, y] of bul) items.push({ name: 'ink', f: (x + y) % 2, x, y });
        // a Fizz + Pop for the "same hue as the player" comparison, and the other hostile projectiles for hue comparison
        items.push({ name: 'p1_idle', f: 0, x: 104, y: 20 }, { name: 'p2_idle', f: 0, x: 124, y: 20 }, { name: 'ink', f: 0, x: 108, y: 44 }, { name: 'ink', f: 1, x: 118, y: 44 }, { name: 'pebble', f: 0, x: 128, y: 44 }, { name: 'spark', f: 0, x: 138, y: 44 });
        const cv = T.scene(items, k, W, H);
        return cv;
      }, [k], z);
    }
  }
  if (sc === 'specials') {
    // thunder / fire / water / letter bubbles (normal + grayscale rows) at k = 1, 2, 4
    for (const [k, z] of [[1, 6], [2, 3], [4, 1]]) {
      await shot('specials_k' + k, (k) => {
        const names = ['bubble_thunder', 'bubble_fire', 'bubble_water', 'bubble_letter', 'bubble'], W = 20 * 2 * names.length + 4, H = 22 * 2 + 4;
        const items = [];
        names.forEach((n, i) => { for (let f = 0; f < 2; f++) { items.push({ name: n, f, x: 2 + (i * 2 + f) * 20 + 2, y: 3 }); } });
        const a = T.scene(items, k, W, 24), cv = T.canvas(a.width, a.height * 2), g = cv.getContext('2d');
        g.drawImage(a, 0, 0); g.filter = 'grayscale(1)'; g.drawImage(a, 0, a.height); g.filter = 'none';
        return cv;
      }, [k], z);
    }
  }
  if (sc === 'trap') {
    // the three trap stages over a captive, normal + grayscale + deuteranopia-like (hue-collapsed) rows, at k = 1, 2, 4
    for (const [k, z] of [[1, 6], [2, 3], [4, 1]]) {
      await shot('trap_k' + k, (k) => {
        const en = ['nibbler', 'crabbit', 'jellop'], items = [];
        en.forEach((e, i) => { for (let s = 0; s < 3; s++) { const x = 2 + (i * 3 + s) * 20 + 2; items.push({ name: e + '_trapped', f: s % 2, x, y: 3 }, { name: 'trap_overlay', f: s, x, y: 3 }); } });
        const a = T.scene(items, k, 2 + 9 * 20 + 4, 24), cv = T.canvas(a.width, a.height * 3), g = cv.getContext('2d');
        g.drawImage(a, 0, 0); g.filter = 'grayscale(1)'; g.drawImage(a, 0, a.height);
        g.filter = 'saturate(0.35) hue-rotate(-20deg) contrast(1.05)'; g.drawImage(a, 0, a.height * 2); g.filter = 'none';
        return cv;
      }, [k], z);
    }
  }
  if (sc === 'pearls') {
    // all eight power-ups, normal / grayscale / deuteranopia-ish rows at k = 1, 1.5, 2, 4
    for (const [k, z] of [[1, 6], [2, 3], [4, 1]]) {
      await shot('pearls_k' + k, (k) => {
        const names = ['pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'], items = [];
        names.forEach((n, i) => items.push({ name: n, f: 0, x: 4 + i * 20, y: 4 }));
        const a = T.scene(items, k, 4 + names.length * 20, 26), cv = T.canvas(a.width, a.height * 3), g = cv.getContext('2d');
        g.drawImage(a, 0, 0); g.filter = 'grayscale(1)'; g.drawImage(a, 0, a.height);
        g.filter = 'saturate(0.35) hue-rotate(-20deg)'; g.drawImage(a, 0, a.height * 2); g.filter = 'none';
        return cv;
      }, [k], z);
    }
  }
  if (sc === 'zoom') {
    // zoom on named sprites: --names=a,b,c --k=8 --frame=0
    const names = opt('names', 'pu_gold').split(','), k = Number(opt('k', '8')), fr = Number(opt('frame', '0')), tagz = opt('ztag', names[0]);
    await shot('zoom_' + tagz + '_k' + k, (names, k, fr) => T.scene(names.map((n, i) => ({ name: n, f: fr, x: 2 + i * (T.specs.get(n).w + 3), y: 2 })), k, 4 + names.reduce((a, n) => a + T.specs.get(n).w + 3, 0), 4 + Math.max(...names.map((n) => T.specs.get(n).h))), [names, k, fr], 1);
  }
  if (sc === 'angry') {
    // calm vs angry twins of the five enemies (frames 0-3) at k = 2 / 4: normal + grayscale rows
    for (const [k, z] of [[2, 3], [4, 1]]) {
      await shot('angry_k' + k, (k) => {
        const E = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'], items = [];
        E.forEach((e, i) => { for (let f = 0; f < 2; f++) { items.push({ name: e + '_move', f: f * 2, x: 4 + (i * 4 + f) * 20, y: 4 }, { name: e + '_angry', f: f * 2, x: 4 + (i * 4 + 2 + f) * 20, y: 4 }); } });
        const W = 4 + E.length * 4 * 20, a = T.scene(items, k, W, 26), cv = T.canvas(a.width, a.height * 2), g = cv.getContext('2d');
        g.drawImage(a, 0, 0); g.filter = 'grayscale(1)'; g.drawImage(a, 0, a.height); g.filter = 'none';
        return cv;
      }, [k], z);
    }
  }
  if (sc === 'frozen') {
    // frozen vs calm enemies + Fizz / Pop on the real platforms of all 6 themes (real GFX: bg + level canvases), 3 x 2 grid
    for (const [k, z] of [[2, 1], [1, 2]]) {
      await shot('frozen_themes_k' + k, (k) => {
        const FZ = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'], cells = [];
        GFX.setScale(k);
        for (let th = 0; th < 6; th++) {
          const i = th * 5, map = LEVELS[i].map, cv = T.canvas(Math.round(256 * k), Math.round(224 * k)), g = cv.getContext('2d');
          g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = true;
          g.fillStyle = '#02040a'; g.fillRect(0, 0, 256, 224);
          g.drawImage(GFX.bgCanvas(i), 0, 16, 256, 208); g.drawImage(GFX.levelCanvas(i, map), 0, 16, 256, 208);
          // platform runs with two free rows above -> sprite slots (18 logical px apart), the biggest runs first
          const runs = [];
          for (let r = 2; r < map.length; r++) {
            let c = 0;
            while (c < map[r].length) {
              if (map[r][c] === '#' && map[r - 1][c] !== '#' && map[r - 2][c] !== '#') { let e = c; while (e < map[r].length && map[r][e] === '#' && map[r - 1][e] !== '#' && map[r - 2][e] !== '#') e++; if (e - c >= 3) runs.push({ r, c, len: e - c }); c = e; } else c++;
            }
          }
          runs.sort((a, b) => b.len - a.len);
          const slots = [];
          for (const run of runs) for (let q = 0; q < Math.floor((run.len * 8 - 2) / 18); q++) slots.push([run.c * 8 + 2 + q * 18, 16 + run.r * 8 - 16]);
          const names = FZ.map((e) => e + '_frozen').concat(['p2_idle', 'p1_idle'], FZ.map((e) => e + '_move'), ['bonefin']);
          names.forEach((n, j) => { if (!slots[j]) return; g.setTransform(k, 0, 0, k, 0, 0); GFX.draw(g, n, 0, slots[j][0], slots[j][1], {}); });
          GFX.postFX && 0;
          cells.push(cv);
        }
        const out = T.canvas(cells[0].width * 3, cells[0].height * 2), og = out.getContext('2d');
        cells.forEach((c, i) => og.drawImage(c, (i % 3) * c.width, Math.floor(i / 3) * c.height));
        return out;
      }, [k], z);
    }
  }
}
console.log('errors', t.errors);
await t.close();
