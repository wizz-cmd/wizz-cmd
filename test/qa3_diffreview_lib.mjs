// QA wave 3 (diffreview lens): shared helpers. Never edits src/. Runs against dist/fizzpop.html.
import { launch, fp, PROJECT, canvasShot } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';
export { PROJECT, canvasShot, fp, launch };
export const OUT = path.join(PROJECT, 'out', 'qa3', 'diffreview');
fs.mkdirSync(OUT, { recursive: true });
export const log = (...a) => console.log(...a);
export const results = [];
export const check = (name, ok, detail) => {
  results.push([name, ok]);
  log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : ''));
};
// in-page helpers
export const HELPERS = `
window.fz = window.__fizzpop;
window.H = (() => {
  const D = () => fz.Game.debug, S = () => fz.Game.debug._S();
  const step = (n, f) => { for (let i = 0; i < n; i++) { fz.input.clear(); if (f) { const r = f(i) || {}; if (r[0]) fz.input.set(0, r[0]); if (r[1]) fz.input.set(1, r[1]); } fz.step(1); } fz.input.clear(); };
  const P = (i = 0) => S().players[i];
  const snap = () => fz.Game.debug.state();
  return { D, S, step, P, snap };
})();`;

export async function boot({ players = 1, level = 1, seed = 1, skipIntro = true, god = false, viewport, touch = false, startGame = true, deviceScaleFactor = 1, initScript } = {}) {
  const t = await launch({ viewport, touch, deviceScaleFactor, initScript, html: process.env.FIZZ_HTML || undefined });
  const g = fp(t.page);
  await g.freeze(true);
  if (startGame) await g.start(players, level, seed);
  await t.page.evaluate(HELPERS);
  if (startGame && skipIntro) await g.evaluate(() => { fz.Game.debug.skipIntro(); });
  if (startGame && god) await g.evaluate(() => { fz.Game.debug.god(true); });
  return { t, g, page: t.page };
}
