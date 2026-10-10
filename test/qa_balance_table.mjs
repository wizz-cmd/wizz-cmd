// QA balance lens: difficulty-curve table straight from LEVELS data (no browser).
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const L = new Function(fs.readFileSync(path.join(ROOT, 'src/00_shared.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/30_levels.js'), 'utf8') + '\nreturn LEVELS;')();
const SPEED = { nibbler: 0.6, crabbit: 0.5, jellop: 0.6, springle: 0.8, glimmer: 0.5 };
console.log('rnd name                 n  types                          hurry spec      air              trapT  scale  angry-nib angry-jel  platforms(rows)');
L.forEach((lv, i) => {
  const r = i + 1;
  const cnt = {}; lv.enemies.forEach(e => cnt[e.t] = (cnt[e.t] || 0) + 1);
  const types = Object.entries(cnt).map(([k, v]) => k.slice(0, 4) + v).join(' ');
  const scale = 1 + Math.min(0.3, 0.01 * (r - 1));
  const trapT = Math.max(240, 480 - 8 * (r - 1));
  const rows = new Set(); lv.map.forEach((row, ri) => { for (let c = 2; c < 30; c++) if (row[c] === '#' && ri > 0 && ri < 25 && lv.map[ri - 1][c] === '.') rows.add(ri); });
  const dens = lv.enemies.length;
  console.log(String(r).padStart(2), (lv.name || '').padEnd(20), String(dens).padStart(2), types.padEnd(30), String(lv.hurry).padStart(4), (lv.specials.join(',') || '-').padEnd(9), JSON.stringify(lv.air).padEnd(16),
    String(trapT).padStart(4), scale.toFixed(2), (0.6 * scale * 1.6).toFixed(2).padStart(8), (0.6 * scale * 1.6).toFixed(2).padStart(8), rows.size);
});
