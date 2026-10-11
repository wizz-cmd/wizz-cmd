import { open, K_VIEWS, sleep } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4), wait = +(process.argv[3] || 1500);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ vw, vh, dpr });
await sleep(wait);
const r = await t.page.evaluate(() => {
  fz = window.__fizzpop; fz.freeze(true); fz._main.setQuality(0, true);
  const cx = document.getElementById('screen').getContext('2d');
  const h0 = fz._main.bigHeroes().count;
  const a0 = performance.now(); fz.goto('ending', { players: 1, scores: [100000, 0] }); cx.getImageData(0, 0, 1, 1); const first = performance.now() - a0;
  const fr = [];
  for (let i = 0; i < 700; i++) { const t0 = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); fr.push(+(performance.now() - t0).toFixed(0)); }
  return { h0, h1: fz._main.bigHeroes().count, px: fz._main.bigHeroes().px, first: +first.toFixed(0), fr };
});
const big = r.fr.map((x, i) => [i, x]).filter((x) => x[1] > 40);
console.log(`k=${k} cold(${wait} ms after load): heroes cached ${r.h0} -> ${r.h1} (${(r.px * 4 / 1048576).toFixed(1)} MB), first ending frame ${r.first} ms; frames >40 ms in 700 ticks: ${big.map((x) => '#' + x[0] + ':' + x[1]).join(' ')}`);
await t.close();
