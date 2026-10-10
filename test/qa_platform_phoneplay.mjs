// QA platform: in-play screenshots on phones (portrait/landscape) with touch controls, plus pressed state and geometry/ergonomics report.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'phone'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser({ autoplay: true });
for (const [name, w, h, dpr] of [['p360x740', 360, 740, 3], ['p412x915', 412, 915, 2.625], ['l844x390', 844, 390, 3], ['l667x375', 667, 375, 2], ['l740x360', 740, 360, 3]]) {
  const t = await open({ browser, viewport: { width: w, height: h }, dpr, touch: true });
  await ev(t.page, () => { fz.freeze(true); fz.start(1, 12, 4); fz.step(200); });
  const cdp = t.cdp;
  const c = async (k) => ev(t.page, (k) => { const r = document.querySelector('[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, k);
  const R = await c('right'), J = await c('jump'), F = await c('fire');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...R, id: 0 }, { ...J, id: 1 }, { ...F, id: 2 }] });
  await t.page.waitForTimeout(100);
  await t.page.screenshot({ path: path.join(D, `${name}_play_pressed.png`) });
  const held = await ev(t.page, () => [...document.querySelectorAll('#touch .on')].map((b) => b.dataset.k));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // geometry: distance of control centres from the bottom / sides; thumb-zone check
  const geo = await ev(t.page, () => { const o = {}; document.querySelectorAll('#touch [data-k]').forEach((b) => { const r = b.getBoundingClientRect(); o[b.dataset.k] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottomGap: Math.round(innerHeight - r.bottom) }; }); return o; });
  log(name, 'multi-touch pressed (R+JUMP+BUBBLE):', JSON.stringify(held), 'geo', JSON.stringify(geo));
  await t.close();
}
await browser.close();
