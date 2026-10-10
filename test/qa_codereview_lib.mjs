// QA codereview lens: shared helpers (do not edit src/). Runs against dist/fizzpop.html.
import { launch, fp, PROJECT, canvasShot } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';
export { PROJECT, canvasShot, fp, launch };
export const OUT = path.join(PROJECT, 'out', 'qa', 'codereview');
fs.mkdirSync(OUT, { recursive: true });

// in-page helpers, installed as window.H
const HELPERS = `
window.H = (() => {
  const D = () => fz.Game.debug, S = () => fz.Game.debug._S();
  const step = (n, f) => { for (let i = 0; i < n; i++) { fz.input.clear(); if (f) { const r = f(i) || {}; if (r[0]) fz.input.set(0, r[0]); if (r[1]) fz.input.set(1, r[1]); } fz.step(1); } fz.input.clear(); };
  const P = (i = 0) => S().players[i];
  const snap = () => fz.Game.debug.state();
  return { D, S, step, P, snap };
})();`;

export async function boot({ players = 1, level = 1, seed = 1, skipIntro = true, god = false, viewport } = {}) {
  const t = await launch({ viewport, html: process.env.FIZZ_HTML || undefined });
  const g = fp(t.page);
  await g.freeze(true);
  await g.start(players, level, seed);
  await t.page.evaluate(HELPERS.replace('window.H =', 'window.fz = window.__fizzpop; window.H ='));
  if (skipIntro) await g.evaluate(() => { fz.Game.debug.skipIntro(); });
  if (god) await g.evaluate(() => { fz.Game.debug.god(true); });
  const ev = (fn, ...args) => g.evaluate(`((${fn.toString()})(window.H, ...args))`, ...args);
  return { t, g, page: t.page, ev };
}
export const log = (...a) => console.log(...a);
