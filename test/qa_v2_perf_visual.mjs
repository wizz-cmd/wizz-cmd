// Deterministic frame capture of a variant (same seed, same inputs, same step count) -> PNG, to diff against dist. usage: node visual.mjs variant scene k q [n]
import fs from 'fs';
import path from 'path';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, HTML, OUT } from './qa_v2_perf_lib.mjs';
const [variant, scene, kS, qS, nS] = [process.argv[2] || 'base', process.argv[3] || 'chain', process.argv[4] || '4', process.argv[5] || '2', process.argv[6] || '160'];
const [vw, vh, dpr] = K_VIEWS[+kS];
const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), vw, vh, dpr });
const NP = ['title', 'story', 'howto', 'scores', 'entry', 'ending'].includes(scene);
const setup = NP ? `(() => { fz = window.__fizzpop; fz.goto('${scene}', ${scene === 'ending' ? "{ players: 1, scores: [100000, 0] }" : 'null'}); })()` : scene === 'typical' ? TYPICAL : BUSY;
await t.page.evaluate(async ({ setup, q, drive, n, NP }) => {
  fz = window.__fizzpop; fz.freeze(true); await new Promise((r) => setTimeout(r, 1200)); (0, eval)(setup); fz._main.setQuality(q, true);
  const drv = (0, eval)('(' + drive + ')');
  for (let i = 0; i < n; i++) { if (!NP) drv(i); fz.step(1); }
}, { setup, q: +qS, drive: DRIVE(scene === 'chain'), n: +nS, NP });
await t.page.waitForTimeout(400);
const dir = path.join(OUT, 'shots'); fs.mkdirSync(dir, { recursive: true });
// full composited page screenshot of the #frame (includes CSS overlays), plus raw canvas pixels
await t.page.locator('#frame').screenshot({ path: path.join(dir, `${scene}_k${kS}_q${qS}_${variant}.png`) });
console.log(path.join(dir, `${scene}_k${kS}_q${qS}_${variant}.png`), t.errors.slice(0, 2));
await t.close();
