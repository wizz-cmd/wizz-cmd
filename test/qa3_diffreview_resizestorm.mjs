// Resize storm: many viewport changes crossing every layout mode; time per fit(), canvas backing-store churn, final layout == fresh layout.
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
for (const touch of [false, true]) {
  const t = await launch({ viewport: { width: 1280, height: 720 }, touch, deviceScaleFactor: 2 });
  const page = t.page;
  await page.waitForFunction(() => !!window.__fizzpop); await page.evaluate(() => window.__fizzpop.scene());
  await page.waitForTimeout(300);
  const sizes = [[1280, 720], [390, 844], [844, 390], [320, 480], [1920, 1080], [600, 400], [360, 640], [768, 1024], [500, 300], [1024, 768]];
  let backingChanges = 0;
  await page.evaluate(() => { window.__cw = []; const c = document.getElementById('screen'); const ob = new MutationObserver(() => window.__cw.push(c.width)); ob.observe(c, { attributes: true, attributeFilter: ['width'] }); });
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) {
    const [w, h] = sizes[i % sizes.length];
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => { for (let k = 0; k < 20; k++) window.dispatchEvent(new Event('resize')); });
  }
  const ms = Date.now() - t0;
  const timing = await page.evaluate(() => { const t0 = performance.now(); for (let k = 0; k < 200; k++) window.__fizzpop._main.fit(); return (performance.now() - t0) / 200; });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const a = await page.evaluate(() => { const L = window.__fizzpop._main.layout(); const c = document.getElementById('screen'); return { mode: L.mode, w: c.style.width, cw: c.width, ir: c.style.imageRendering }; });
  const fresh = await launch({ viewport: { width: 390, height: 844 }, touch, deviceScaleFactor: 2 });
  await fresh.page.waitForFunction(() => !!window.__fizzpop); await fresh.page.evaluate(() => window.__fizzpop.scene()); await fresh.page.waitForTimeout(400);
  const b = await fresh.page.evaluate(() => { const L = window.__fizzpop._main.layout(); const c = document.getElementById('screen'); return { mode: L.mode, w: c.style.width, cw: c.width, ir: c.style.imageRendering }; });
  const nCw = await page.evaluate(() => window.__cw.length);
  log(`touch=${touch} storm ${ms} ms, fit() avg ${timing.toFixed(3)} ms, backing-store resizes ${nCw}, after: ${JSON.stringify(a)} fresh: ${JSON.stringify(b)}`);
  check(`RS1 touch=${touch}: layout after storm == fresh layout`, JSON.stringify(a) === JSON.stringify(b), { a, b });
  check(`RS2 touch=${touch}: fit() is cheap (<3 ms)`, timing < 3, timing);
  check(`RS3 touch=${touch}: no errors`, t.errors.length === 0, t.errors);
  await fresh.close(); await t.close();
}
