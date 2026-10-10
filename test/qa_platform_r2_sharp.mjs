// Prototype check of the "sharp-bilinear" fractional scaling fix on a patched COPY (dist untouched): visual + edge sharpness + cost.
import { launchBrowser, open, ev, OUT, DIST, save, sleep } from './qa_platform_r2_lib.mjs';
const PATCHED = OUT + '/fizzpop_sharpbilinear2.html';
const browser = await launchBrowser({ autoplay: true });
const res = {};
for (const [name, html] of [['baseline', DIST], ['sharp', PATCHED]]) {
  for (const [lab, vp, dpr, touch] of [['ph360@3', { width: 360, height: 740 }, 3, true], ['ph390@2', { width: 390, height: 844 }, 2, true], ['win800x600@1', { width: 800, height: 600 }, 1, false]]) {
    const t = await open({ browser, html, viewport: vp, dpr, touch, colorScheme: 'dark' });
    await ev(t.page, () => { fz.freeze(true); fz.start(2, 9, 4); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.step(260); });
    await sleep(150);
    const box = await t.page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bw: document.getElementById('screen').width }; });
    await t.page.screenshot({ path: `${OUT}/sharp2_${name}_${lab.replace(/[@x]/g, '_')}.png`, clip: { x: box.x, y: box.y, width: Math.min(box.w, 360), height: Math.min(box.h, 200) } });
    // cost with 6x throttle on the heavy scene (render only)
    await t.cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await ev(t.page, () => { fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true); const r = fz.U.rng(3); for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190)); fz.freeze(false); });
    await sleep(500);
    const m = await ev(t.page, () => new Promise((res) => { const ts = []; const f = (n) => { ts.push(n); if (n - ts[0] < 3000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: +(1000 * d.length / (ts[ts.length - 1] - ts[0])).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), over25: d.filter((x) => x > 25).length }); } }; requestAnimationFrame(f); }));
    // frozen step timing (render incl. canvas fill)
    await ev(t.page, () => fz.freeze(true));
    const st = await ev(t.page, () => { const a = []; for (let i = 0; i < 200; i++) { const t0 = performance.now(); fz.step(1); a.push(performance.now() - t0); } a.sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +a[190].toFixed(2) }; });
    res[`${name} ${lab}`] = { backing: box.bw, css: `${box.w}x${box.h}`, rafAt6x: m, stepAt6x: st };
    console.log(`${name} ${lab}`, JSON.stringify(res[`${name} ${lab}`]), JSON.stringify(t.errors));
    await t.close();
  }
}
await browser.close();
save('sharp2.json', res);
