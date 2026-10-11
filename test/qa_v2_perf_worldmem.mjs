import path from 'path';
import { open, K_VIEWS, HTML, OUT } from './qa_v2_perf_lib.mjs';
for (const v of ['base', 'kexact']) for (const k of [4, 6, 8]) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ html: v === 'base' ? HTML : path.join(OUT, 'variants', v + '.html'), vw, vh, dpr });
  const r = await t.page.evaluate(() => { fz = window.__fizzpop; fz._main.setQuality(2, true); fz.freeze(true); for (let lvl = 1; lvl <= 8; lvl++) { fz.start(1, lvl, 3); fz.Game.debug.skipIntro(); for (let i = 0; i < 20; i++) fz.step(1); } const s = fz.GFX._stats(); return { k: s.k, kb: s.kb, worldMB: s.worldPx * 4 / 1048576, levels: s.levels, bgs: s.bgs }; });
  console.log(`${v.padEnd(7)} k=${r.k} (bake ${r.kb}): world canvases ${r.levels} levels + ${r.bgs} bgs = ${r.worldMB.toFixed(1)} MB`);
  await t.close();
}
