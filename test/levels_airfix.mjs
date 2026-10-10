// FIZZ & POP — test/levels_airfix.mjs
// Dev helper: for the air attractors of the given rounds propose the nearest 0.5-grid positions that are in open
// water (no solid cell under the 16x16 bubble) and can be popped from many reachable standing spots.
//   node test/levels_airfix.mjs 2 4 11      (prints up to 3 suggestions per attractor)
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLevels } from '../tools/validate_levels.mjs';
import { world, explore } from './levels_check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = loadLevels(path.join(HERE, '..', 'src', '30_levels.js'));
const open = (map, ax, ay) => {
  for (let r = Math.floor(ay - 1); r <= Math.ceil(ay + 1) - 1; r++) for (let c = Math.floor(ax - 1); c <= Math.ceil(ax + 1) - 1; c++) if (map[r] && map[r][c] === '#') return false;
  return true;
};
for (const n of process.argv.slice(2).map(Number)) {
  const lv = LEVELS[n - 1];
  const cands = [];
  lv.air.forEach(([ax, ay], i) => {
    for (let dx = -5; dx <= 5; dx += 0.5) for (let dy = -4; dy <= 4; dy += 0.5) {
      const x = ax + dx, y = ay + dy;
      if (x < 3 || x > 29 || y < 2 || y > 22) continue;
      if (open(lv.map, x, y)) cands.push({ i, x, y, d: Math.hypot(dx, dy * 1.3) });
    }
  });
  const ex = explore(world(lv.map), { x: 24, s: 25 }, cands.map((c) => [c.x, c.y]));
  cands.forEach((c, k) => { c.pops = ex.pops[k].size; });
  lv.air.forEach(([ax, ay], i) => {
    const best = cands.filter((c) => c.i === i && c.pops >= 40).sort((a, b) => a.d - b.d).slice(0, 4);
    console.log(`R${n} air[${i}] [${ax}, ${ay}] -> ${best.map((b) => `[${b.x}, ${b.y}] (pops ${b.pops})`).join('  ') || 'none'}`);
  });
}
