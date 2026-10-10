// First touch on a (pointer: fine) device with a touch screen: noteTouch() -> fit() flips to the touch layout inside the pointerdown handler, then the
// tap is mapped through the NEW canvas rect although clientX/Y were measured on the OLD layout.
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const results = [];
for (const [w, h] of [[1280, 800], [1024, 768], [1366, 768], [1920, 1080], [800, 600]]) {
  for (const rowId of ['p1', 'help']) {
    const t = await launch({ viewport: { width: w, height: h } });
    const page = t.page; await page.waitForFunction(() => !!window.__fizzpop); await page.evaluate(() => window.__fizzpop.scene()); await page.waitForTimeout(300);
    const before = await page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, rows: window.__fizzpop._main.rows(), touch: window.__fizzpop._main.touchMode() }; });
    const row = before.rows.find((r) => r.id === rowId);
    const tx = before.x + ((row.x0 + row.x1) / 2) * before.w / 256, ty = before.y + (row.top + row.h / 2) * before.h / 224;
    await page.evaluate(([x, y]) => { const c = document.getElementById('screen'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true })); c.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true, isPrimary: true })); }, [tx, ty]);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ scene: window.__fizzpop.scene(), touch: window.__fizzpop._main.touchMode(), r: (() => { const r = document.getElementById('screen').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() }));
    const want = rowId === 'p1' ? 'story' : 'howto';
    log(`${w}x${h} row=${rowId}: desktop canvas ${[before.x, before.y, before.w, before.h].map(Math.round)} -> touch canvas ${after.r}; tap at (${Math.round(tx)},${Math.round(ty)}) -> scene=${after.scene} (wanted ${want})`);
    results.push({ w, h, rowId, ok: after.scene === want, after });
    await t.close();
  }
}
check('FT2 the first touch (which flips the layout) activates the row the finger was on', results.every((r) => r.ok), results.filter((r) => !r.ok));
