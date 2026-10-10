// QA balance lens: shared node-side helpers (levels loader, reach data loader, geometry).
import fs from 'fs'; import path from 'path'; import { PROJECT } from '../tools/harness.mjs';
export const OUT = path.join(PROJECT, 'out', 'qa', 'balance');
export const LEVELS = new Function(fs.readFileSync(path.join(PROJECT, 'src/00_shared.js'), 'utf8') + '\n' + fs.readFileSync(path.join(PROJECT, 'src/30_levels.js'), 'utf8') + '\nreturn LEVELS;')();
export const pad2 = (n) => String(n).padStart(2, '0');
export function loadReach(lv, pad = 1) {
  const f = path.join(OUT, `reach_p${pad}_${pad2(lv)}.json`);
  const r = JSON.parse(fs.readFileSync(f));
  const buf = Buffer.from(r.tmin, 'base64');
  const tmin = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  return { nodes: r.nodes, tmin, steps: r.steps };
}
export const W = 256, YO = 16;
export const tAt = (R, px, py) => { px = Math.round(px); py = Math.round(py) + YO; if (px < 0 || px >= 256 || py < 0 || py >= 248) return 65535; return R.tmin[py * 256 + px]; };
/** min frames at which the player's sprite origin can be inside px in [x0,x1], py in [y0,y1] (inclusive ints) */
export function tBox(R, x0, x1, y0, y1) {
  let best = 65535;
  x0 = Math.max(0, Math.ceil(x0)); x1 = Math.min(255, Math.floor(x1));
  y0 = Math.max(-16, Math.ceil(y0)); y1 = Math.min(231, Math.floor(y1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = R.tmin[(y + YO) * 256 + x]; if (v < best) best = v; }
  return best;
}
// bubble at top-left (bx,by): player origin box overlap region (see Game.playerBubbleContacts: player body [px+2,py+2,12,14] vs bubble hit [bx+2,by+2,12,12])
export const tBubble = (R, bx, by) => tBox(R, bx - 11, bx + 11, by - 13, by + 11);
export const solid = (def, c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && def.map[r][c] === '#');
export const landable = (def, c, r) => r >= 1 && r < 26 && solid(def, c, r) && !solid(def, c, r - 1);
export function surfaceRuns(def) {
  const runs = [];
  for (let r = 1; r < 26; r++) { let c = 2; while (c < 30) { if (landable(def, c, r)) { const c0 = c; while (c < 30 && landable(def, c, r)) c++; runs.push({ r, c0, c1: c - 1 }); } else c++; } }
  return runs;
}
// a surface run (r,c0..c1) is stood on when player y == 16 + r*8 - 16 = r*8 and body overlaps cols
export function runCost(R, run) {
  const y = run.r * 8; let best = 65535;
  for (const n of R.nodes) { if (Math.abs(n[1] - y) < 0.5 && n[0] + 14 > run.c0 * 8 && n[0] + 2 < (run.c1 + 1) * 8) best = Math.min(best, n[2]); }
  return best;
}
