import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 30, 4); await g.step(1);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(20);
// freeze kraken position in the open centre and trigger a volley; record the first 40 frames following the bullets
const kpos = await g.evaluate(() => { const k = fz.Game.debug._S().enemies.find(e => e.t === 'kraken'); return { x: k.x, y: k.y }; });
await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); k.inkT = 1; fz.Game.debug.setPlayer(0, { x: 40, y: 200 }); });
await g.step(1);
const rows = [];
await page.evaluate(() => QA.reset());
for (let i = 0; i < 40; i += 2) {
  await g.step(2);
  const k = await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); return { x: k.x, y: k.y, n: S.proj.filter(p => p.type === 'ink').length }; });
  await page.evaluate(({ k, i }) => QA.push(k.x - 20, k.y - 10, 88, 80, 'ink f' + i + ' n' + k.n), { k, i });
}
console.log(await sheet(page, `${OUT}/boss/ink_emission.png`, { cols: 5, scale: 1.4, smooth: false }));
// contrast of ink sprite itself vs kraken body: mean colour/luminance
const r = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const k = 4; GFX.setScale(k);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const stat = (name, f) => { const sz = GFX.size(name); const W = Math.ceil((sz.w + 16) * k), H = Math.ceil((sz.h + 16) * k); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.setTransform(k, 0, 0, k, 0, 0); GFX.draw(c, name, f, 8, 8); const d = c.getImageData(0, 0, W, H).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.1) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } } return [Math.round(r / n), Math.round(g / n), Math.round(b / n), n]; };
  return { ink0: stat('ink', 0), ink1: stat('ink', 1), kraken: stat('kraken', 0), krakenA: stat('kraken_angry', 0), p1: stat('p1_idle', 0), pebble: stat('pebble', 0), spark: stat('spark', 0) };
});
console.log(JSON.stringify(r));
await t.close();
