// QA platform: layout matrix (viewport x DPR x theme x touch). Prints metrics, saves page screenshots to out/qa/platform/layout/.
import fs from 'fs'; import path from 'path';
import { open, launchBrowser, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'layout'); fs.mkdirSync(D, { recursive: true });
const cases = [
  ['ph360x740', 360, 740, 3, true], ['ph390x844', 390, 844, 3, true], ['ph412x915', 412, 915, 2.625, true],
  ['ph360x740_dpr2', 360, 740, 2, true],
  ['ph740x360L', 740, 360, 3, true], ['ph844x390L', 844, 390, 3, true], ['ph915x412L', 915, 412, 2.625, true], ['se667x375L', 667, 375, 2, true],
  ['tab768x1024', 768, 1024, 2, true], ['tab1024x768L', 1024, 768, 2, true],
  ['d1280x800_1', 1280, 800, 1, false], ['d1280x800_2', 1280, 800, 2, false],
  ['d1920x1080_1', 1920, 1080, 1, false], ['d1920x1080_2', 1920, 1080, 2, false],
  ['art720x600', 720, 600, 1, false], ['art560x700', 560, 700, 2, false], ['art900x500', 900, 500, 1, false],
  ['tiny320x480', 320, 480, 2, true], ['tiny280x400', 280, 400, 2, true],
];
const browser = await launchBrowser();
const rows = [];
for (const [name, w, h, dpr, touch] of cases) {
  for (const cs of (name.startsWith('d1280') || name.startsWith('ph390') ? ['light', 'dark'] : ['dark'])) {
    const t = await open({ browser, viewport: { width: w, height: h }, touch, dpr, colorScheme: cs });
    await ev(t.page, () => { fz.freeze(true); fz.step(30); });
    await t.page.waitForTimeout(150);
    const m = await ev(t.page, () => {
      const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
      const cv = R(document.getElementById('screen'));
      const btns = {}; document.querySelectorAll('#touch [data-k]').forEach((b) => { btns[b.dataset.k] = R(b); });
      const de = document.documentElement;
      return { lay: fz._main.layout(), cv, btns, touchMode: fz._main.touchMode(), sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, ch: de.clientHeight, dpr: devicePixelRatio,
        focusVisible: !document.getElementById('focus').hidden, legend: R(document.getElementById('legend')), touchEl: R(document.getElementById('touch')) };
    });
    const devScale = m.cv.w * dpr / 256;
    const usage = (m.cv.w * m.cv.h) / (w * h);
    const small = Object.entries(m.btns).filter(([k, r]) => r && r.w > 0 && Math.min(r.w, r.h) < 44).map(([k, r]) => `${k}:${r.w}x${r.h}`);
    // overlap of any touch button with canvas
    const over = Object.entries(m.btns).filter(([k, r]) => r && r.w > 0 && !(r.x + r.w <= m.cv.x || r.x >= m.cv.x + m.cv.w || r.y + r.h <= m.cv.y || r.y >= m.cv.y + m.cv.h)).map(([k]) => k);
    const row = { name: name + '_' + cs, vp: `${w}x${h}@${dpr}`, touchMode: m.touchMode, cv: `${m.cv.w}x${m.cv.h}@(${m.cv.x},${m.cv.y})`, cssScale: +(m.cv.w / 256).toFixed(3), devPxPerPx: +devScale.toFixed(3), integerDev: Math.abs(devScale - Math.round(devScale)) < 0.01, usagePct: +(usage * 100).toFixed(1), hscroll: m.sw > m.cw, vscroll: m.sh > m.ch, smallBtns: small.join(','), overlapCanvas: over.join(','), focusOverlay: m.focusVisible, errors: t.errors.length };
    rows.push(row);
    log(JSON.stringify(row));
    await t.page.screenshot({ path: path.join(D, `${name}_${cs}.png`) });
    if (touch) fs.writeFileSync(path.join(D, `${name}_${cs}.btns.json`), JSON.stringify(m.btns));
    await t.close();
  }
}
fs.writeFileSync(path.join(D, 'matrix.json'), JSON.stringify(rows, null, 1));
await browser.close();
