// Look at phone play screens (HUD legibility at fractional scale), pause menu with tap rows, name entry, and compute tap-target sizes.
import { launchBrowser, open, ev, OUT, save, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: true });
const out = {};
for (const [name, w, h, dpr] of [['p360', 360, 740, 3], ['l844', 844, 390, 3], ['p390', 390, 844, 3]]) {
  const t = await open({ browser, viewport: { width: w, height: h }, dpr, touch: true, colorScheme: 'dark' });
  await ev(t.page, () => { fz.freeze(true); fz.start(2, 9, 4); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.step(260); });
  await sleep(200);
  await t.page.screenshot({ path: `${OUT}/play_${name}.png` });
  await ev(t.page, () => { fz.goto('pause'); });
  await sleep(100);
  await t.page.screenshot({ path: `${OUT}/pause_${name}.png` });
  // tap-target geometry: rows in css px
  const L = await ev(t.page, () => fz._main.layout());
  const s = L.scale;
  out[name] = { scale: +s.toFixed(3), titleRowCss: +(14 * s).toFixed(1), titleRowHitCss: +(14 * s).toFixed(1), pauseRowCss: +(16 * s).toFixed(1), needFingerRows: +(44 / s / 14).toFixed(2) };
  await t.close();
}
await browser.close();
save('tap_targets.json', out);
console.log(JSON.stringify(out, null, 1));
