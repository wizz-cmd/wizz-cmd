// Static analysis: can a standing jump (apex 43.9 px) pop a bubble hovering at each level's air attractors?
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(ROOT, 'src/30_levels.js'), 'utf8');
const L = new Function(fs.readFileSync(path.join(ROOT, 'src/00_shared.js'), 'utf8') + '\n' + src + '\nreturn LEVELS;')();
const solid = (m, c, r) => c < 2 || c > 29 ? true : (r < 0 || r > 25 ? false : m[r][c] === '#');
const bad = [];
L.forEach((lv, li) => {
  (lv.air || []).forEach(([ac, ar]) => {
    const ax = ac * 8, ay = 16 + ar * 8;
    let best = Infinity, bestInfo = null;
    for (let c = 2; c <= 29; c++) {
      if (Math.abs(c * 8 + 4 - ax) > 44) continue;                // body can drift ~44px horizontally during the jump
      for (let r = 1; r < 25; r++) {
        if (solid(lv.map, c, r) && !solid(lv.map, c, r - 1)) {
          const S = 16 + r * 8;
          const out = S - (ay + 63.9);                              // > 0 means feet surface too far below
          if (out < best) { best = out; bestInfo = { c, r, S }; }
        }
      }
    }
    if (best > 0) bad.push({ level: li + 1, attractor: [ac, ar], ay, closestSurface: bestInfo, shortByPx: +best.toFixed(1) });
  });
});
console.log(JSON.stringify(bad, null, 1));
console.log('attractors unreachable by a standing jump:', bad.length);
