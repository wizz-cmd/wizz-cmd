// Layout matrix: viewport x dpr x touch x scheme. Measures canvas use, button sizes, overflow, device-px scale; screenshots.
import { open, launchBrowser, ev, OUT, save } from './qa_platform_r2_lib.mjs';
import path from 'path';
const cfgs = [
  ['ph360x740', 360, 740, 3, true], ['ph390x844', 390, 844, 3, true], ['ph412x915', 412, 915, 2.625, true],
  ['ph740x360L', 740, 360, 3, true], ['ph844x390L', 844, 390, 3, true], ['ph915x412L', 915, 412, 2.625, true],
  ['tab768x1024', 768, 1024, 2, true], ['tab1024x768L', 1024, 768, 2, true],
  ['d1280x800_1', 1280, 800, 1, false], ['d1280x800_2', 1280, 800, 2, false],
  ['d1920x1080_1', 1920, 1080, 1, false], ['d1920x1080_2', 1920, 1080, 2, false],
  ['d1366x768_1', 1366, 768, 1, false], ['d1440x900_2', 1440, 900, 2, false],
];
const browser = await launchBrowser();
const rows = [];
for (const [name, w, h, dpr, touch] of cfgs) {
  for (const scheme of ['light', 'dark']) {
    if (scheme === 'light' && !/ph390x844|d1280x800_1|ph844x390L/.test(name)) continue;
    const t = await open({ browser, viewport: { width: w, height: h }, dpr, touch, colorScheme: scheme });
    await new Promise((r) => setTimeout(r, 300));
    const m = await t.page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      const cv = document.getElementById('screen');
      const btns = {};
      document.querySelectorAll('#touch [data-k]').forEach((b) => { btns[b.dataset.k] = r(b); });
      const de = document.documentElement;
      return {
        vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
        canvas: r(cv), legend: r(document.getElementById('legend')), touchBar: r(document.getElementById('touch')), btns,
        scrollW: de.scrollWidth, scrollH: de.scrollHeight, bodyScrollH: document.body.scrollHeight,
        touchMode: window.__fizzpop._main.touchMode(), layout: window.__fizzpop._main.layout(),
        coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
      };
    });
    const cssScale = m.canvas.w / 256;
    const devScale = cssScale * m.dpr;
    const used = (m.canvas.w * m.canvas.h) / (m.vw * m.vh);
    const minBtn = Object.values(m.btns).length ? Math.min(...Object.entries(m.btns).filter(([k]) => ['left', 'right', 'jump', 'fire'].includes(k)).map(([, b]) => Math.min(b.w, b.h))) : null;
    const smBtn = m.btns.pause ? Math.min(m.btns.pause.h, m.btns.sound.h) : null;
    const row = { name, scheme, vw: m.vw, vh: m.vh, dpr: m.dpr, touchMode: m.touchMode, coarse: m.coarse, canvas: `${m.canvas.w}x${m.canvas.h}@(${m.canvas.x},${m.canvas.y})`, cssScale: +cssScale.toFixed(3), devScale: +devScale.toFixed(3), intDev: Math.abs(devScale - Math.round(devScale)) < 0.02, usedPct: +(used * 100).toFixed(1), minPadBtn: minBtn, smBtnH: smBtn, overflowX: m.scrollW > m.vw, overflowY: m.scrollH > m.vh, scrollH: m.scrollH, touchBarCenterYpct: m.touchBar ? +(((m.touchBar.y + m.touchBar.h / 2) / m.vh) * 100).toFixed(0) : null, btns: m.btns, errors: t.errors.length };
    rows.push(row);
    await t.page.screenshot({ path: path.join(OUT, `layout_${name}_${scheme}.png`) });
    await t.close();
  }
}
await browser.close();
save('layout_matrix.json', rows);
for (const r of rows) console.log(r.name.padEnd(14), r.scheme.padEnd(5), `${r.vw}x${r.vh}@${r.dpr}`.padEnd(14), 'touch', r.touchMode ? 'Y' : 'n', 'canvas', r.canvas.padEnd(24), 'css×', r.cssScale, 'dev×', r.devScale, r.intDev ? 'INT' : 'FRAC', 'used', r.usedPct + '%', 'minPad', r.minPadBtn, 'sm', r.smBtnH, 'ovX', r.overflowX, 'ovY', r.overflowY, 'barY%', r.touchBarCenterYpct);
