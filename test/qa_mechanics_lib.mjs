// QA mechanics lens: shared helpers (do not edit src/). Runs against dist/fizzpop.html.
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';
export { PROJECT, canvasShot };
export const OUT = path.join(PROJECT, 'out', 'qa', 'mechanics');
fs.mkdirSync(OUT, { recursive: true });

const HELPERS = `(() => {
  const D = fz.Game.debug, S = () => fz.Game.debug._S();
  // step n frames; f(i) -> [in1,in2] partial virtual input per frame (applied before each step)
  const step = (n, f) => { for (let i = 0; i < n; i++) { fz.input.clear(); if (f) { const r = f(i) || {}; if (r[0]) fz.input.set(0, r[0]); if (r[1]) fz.input.set(1, r[1]); } fz.step(1); } fz.input.clear(); };
  const P = (i = 0) => S().players[i];
  const alive = (a) => a.filter(x => !x.dead);
  // create an empty floating bubble at (x,y) via a real shot (keeps existing bubbles)
  const mkBubble = (x, y, pi = 0) => {
    const p = P(pi); const sv = { x: p.x, y: p.y, vy: p.vy, face: p.face, inv: p.inv, cd: p.cooldown, noPop: p.noPopT, g: p.onGround };
    const n0 = S().bubbles.length;
    p.x = 200; p.y = 200; p.face = 1; p.cooldown = 0; p.noPopT = 1e7; p.inv = 1e7;
    fz.input.clear(); fz.input.set(pi, { fire: true }); fz.step(1); fz.input.clear();
    const b = S().bubbles[S().bubbles.length - 1];
    b.x = x; b.y = y; b.att = null; b.state = 'float'; b.age = 0; b.grace = -1; b.life = 660; b.dist = 0;
    Object.assign(p, { x: sv.x, y: sv.y, vy: sv.vy, face: sv.face, inv: sv.inv, cooldown: sv.cd, noPopT: sv.noPop, onGround: sv.g });
    return b;
  };
  return { D, S, step, P, alive, mkBubble };
})()`;

export async function boot({ players = 1, level = 1, seed = 1, skipIntro = true, god = false, clear = false, html } = {}) {
  const t = await launch(html ? { html } : {});
  const g = fp(t.page);
  await g.freeze(true);
  await g.start(players, level, seed);
  await g.evaluate(`eval(${JSON.stringify('window.H = ' + HELPERS)})`);
  if (skipIntro) await g.evaluate(() => { fz.Game.debug.skipIntro(); });
  if (god) await g.evaluate(() => { fz.Game.debug.god(true); });
  if (clear) await g.evaluate(() => { fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); });
  // ev(fn, ...args): runs fn(H, ...args) in page
  const ev = (fn, ...args) => g.evaluate(`((${fn.toString()})(window.H, ...args))`, ...args);
  return { t, g, page: t.page, ev };
}
export const fmt = (o) => JSON.stringify(o);

// In-page arena builder source; call via ev: sets S.solid to walls + floor + ceiling + blocks [[c0,r0,c1,r1],...]
export const ARENA_SRC = `
window.arena = (blocks = [], floorGaps = []) => {
  const S = fz.Game.debug._S();
  const COLS = 32, ROWS = 26;
  const g = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    let s = (c < 2 || c > 29) || r === 0 || r === 25;
    if (r === 25 && floorGaps.some(([a, b]) => c >= a && c <= b)) s = (c < 2 || c > 29);
    if (r === 0 && floorGaps.some(([a, b]) => c >= a && c <= b)) s = (c < 2 || c > 29);
    g[r * COLS + c] = s ? 1 : 0;
  }
  for (const [c0, r0, c1, r1] of blocks) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r * COLS + c] = 1;
  S.solid = g;
  // also rebuild S.gaps (used by special spawns)
  const gaps = []; let c = 2;
  while (c < 30) { if (!g[25 * COLS + c]) { const c0 = c; while (c < 30 && !g[25 * COLS + c]) c++; gaps.push([c0, c - 1]); } else c++; }
  S.gaps = gaps;
  S.spots = [];
};
`;
export async function arenaBoot(opts = {}) {
  const b = await boot({ clear: true, ...opts });
  await b.g.evaluate(`eval(${JSON.stringify(ARENA_SRC)})`);
  return b;
}
