// QA balance lens: ASCII view of the reach data. node test/qa_balance_reachview.mjs <round> [pad]
import fs from 'fs'; import path from 'path'; import { PROJECT } from '../tools/harness.mjs';
const L = new Function(fs.readFileSync(path.join(PROJECT, 'src/00_shared.js'), 'utf8') + '\n' + fs.readFileSync(path.join(PROJECT, 'src/30_levels.js'), 'utf8') + '\nreturn LEVELS;')();
const lv = +process.argv[2], pad = process.argv[3] || 1;
const r = JSON.parse(fs.readFileSync(path.join(PROJECT, 'out/qa/balance', `reach_p${pad}_${String(lv).padStart(2, '0')}.json`)));
const def = L[lv - 1];
const grid = def.map.map((row) => row.split(''));
for (const [x, y] of r.nodes) { const row = Math.round((y + 16 - 16) / 8); const c0 = Math.floor((x + 2) / 8), c1 = Math.floor((x + 13.99) / 8); for (let c = c0; c <= c1; c++) if (grid[row] && grid[row][c] === '#') grid[row][c] = '='; }
for (const e of def.enemies) { grid[e.r][e.c] = e.t[0].toUpperCase(); }
for (const a of def.air) { const rr = Math.round(a[1]), cc = Math.round(a[0]); if (grid[rr]) grid[rr][cc] = '*'; }
console.log('     ' + '0123456789'.repeat(4).slice(0, 32));
grid.forEach((g, i) => console.log(String(i).padStart(3) + '  ' + g.join('')));
const maxc = Math.max(...r.nodes.map((n) => n[2]));
console.log('nodes', r.nodes.length, 'max cost frames', maxc);
