// QA platform: safe-area insets (iPhone notch / home indicator) via CDP Emulation.setSafeAreaInsetsOverride, in the publish-skeleton wrapper (viewport-fit=cover).
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'artifact');
const browser = await launchBrowser({ autoplay: true });
for (const [name, w, h, ins] of [['port390x844', 390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], ['land844x390', 844, 390, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
  for (const file of ['nested.html']) {
    const t = await open({ browser, html: path.join(D, file), viewport: { width: w, height: h }, dpr: 3, touch: true });
    let ok = true;
    try { await t.cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }); } catch (e) { ok = false; log('setSafeAreaInsetsOverride unsupported:', e.message); }
    await ev(t.page, () => { fz.freeze(true); fz.start(1, 5, 3); fz.step(150); fz._main.fit(); });
    await t.page.waitForTimeout(200);
    const r = await ev(t.page, () => { const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }; const o = { vp: [innerWidth, innerHeight], canvas: R(document.getElementById('screen')), touch: R(document.getElementById('touch')) }; document.querySelectorAll('#touch [data-k]').forEach((b) => { o[b.dataset.k] = R(b); }); const de = document.documentElement; o.rootPad = getComputedStyle(de).paddingTop + ' ' + getComputedStyle(de).paddingBottom; o.scroll = [de.scrollHeight, de.clientHeight]; return o; });
    log(name, file, 'override ok', ok, JSON.stringify(r));
    await t.page.screenshot({ path: path.join(D, `safearea_${name}.png`) });
    await t.close();
  }
}
await browser.close();
