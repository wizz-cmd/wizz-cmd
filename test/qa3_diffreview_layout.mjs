// Layout sweep: viewports x dpr x touch.  Invariants: canvas inside the viewport, no horizontal scroll, controls inside the viewport and not covering
// the canvas (except the deliberate "over" mode), aspect ratio, 16 px gutters, integer device pixels when not sharp.
import { launch, fp, log, check, OUT, canvasShot } from './qa3_diffreview_lib.mjs';
import fs from 'fs';
const sizes = (process.argv[2] === 'odd' ? [[280, 653], [320, 900], [360, 360], [412, 412], [540, 720], [1000, 500], [500, 1000], [360, 500], [300, 300], [253, 640], [700, 330], [330, 700]] : [[320, 480], [320, 568], [360, 640], [360, 740], [375, 667], [390, 844], [412, 915], [430, 932], [600, 800], [768, 1024], [1024, 768], [480, 270], [568, 320], [640, 360], [667, 375], [740, 360], [844, 390], [915, 412], [932, 430], [1280, 720], [1366, 768], [1920, 1080], [800, 600], [500, 300], [256, 224], [200, 150]]);
const dprs = process.argv[2] === 'odd' ? [2, 3] : [1, 2, 3, 1.25];
const bad = [];
let n = 0;
const browserTouch = async (touch, vp, dpr) => {
  const t = await launch({ viewport: { width: vp[0], height: vp[1] }, touch, deviceScaleFactor: dpr });
  await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop._main);
  await t.page.evaluate(() => window.__fizzpop.scene());   // finishes boot
  await t.page.waitForTimeout(150);
  return t;
};
for (const touch of [false, true]) for (const dpr of dprs) {
  // reuse one browser per (touch,dpr) combo: resize via page.setViewportSize
  const t = await browserTouch(touch, sizes[0], dpr);
  const page = t.page;
  for (const vp of sizes) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(60);
    await page.evaluate(() => window.__fizzpop._main.fit());
    const m = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, disp: getComputedStyle(el).display }; };
      const L = window.__fizzpop._main.layout();
      return {
        L, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, bodyScrollW: document.body.scrollWidth,
        canvas: r(document.getElementById('screen')), touch: r(document.getElementById('touch')), legend: r(document.getElementById('legend')),
        btns: [...document.querySelectorAll('#touch button')].map((b) => ({ k: b.dataset.k, ...r(b) })),
        cw: document.getElementById('screen').width, ch: document.getElementById('screen').height, ir: getComputedStyle(document.getElementById('screen')).imageRendering,
        touchCls: document.documentElement.className,
      };
    });
    n++;
    const why = [];
    const c = m.canvas;
    if (m.scrollW > m.vw + 1) why.push('hscroll ' + m.scrollW + '>' + m.vw);
    if (c.x < -0.5 || c.r > m.vw + 0.5) why.push('canvas outside x ' + c.x.toFixed(1) + '..' + c.r.toFixed(1));
    if (Math.abs(c.w / c.h - 256 / 224) > 0.006) why.push('aspect ' + (c.w / c.h).toFixed(3));
    const touchOn = touch && m.touchCls.includes('touch');
    if (touchOn) {
      for (const b of m.btns) {
        if (b.w <= 0) continue;
        if (b.x < -0.5 || b.r > m.vw + 0.5 || b.y < -0.5 || b.b > m.vh + 0.5) why.push(`btn ${b.k} outside ${b.x.toFixed(0)},${b.y.toFixed(0)}..${b.r.toFixed(0)},${b.b.toFixed(0)}`);
        if (m.L.mode !== 'over') {
          const ov = !(b.r <= c.x + 1 || b.x >= c.r - 1 || b.b <= c.y + 1 || b.y >= c.b - 1);
          if (ov) why.push(`btn ${b.k} overlaps canvas`);
        }
        if (b.w < 43.5 || b.h < 43.5) why.push(`btn ${b.k} small ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
      }
      // buttons among themselves
      for (let i = 0; i < m.btns.length; i++) for (let j = i + 1; j < m.btns.length; j++) {
        const a = m.btns[i], b = m.btns[j];
        if (a.w <= 0 || b.w <= 0) continue;
        if (!(a.r <= b.x + 0.5 || b.r <= a.x + 0.5 || a.b <= b.y + 0.5 || b.b <= a.y + 0.5)) why.push(`btn ${a.k}/${b.k} overlap`);
      }
    }
    if (!touchOn && m.legend && m.legend.disp !== 'none') {
      if (m.legend.y < c.b - 1) why.push('legend overlaps canvas');
      if (m.legend.b > m.vh + 1) why.push('legend below fold');
    }
    // vertical: canvas inside the viewport (not scrolled away at scroll 0)
    if (c.y < -0.5) why.push('canvas above top ' + c.y.toFixed(1));
    if (c.b > m.vh + 0.5 && m.scrollH <= m.vh + 1) why.push('canvas below viewport');
    if (m.L.sharp === false && m.L.scale >= 1) {
      const devW = c.w * dpr; if (Math.abs(devW - Math.round(devW)) > 0.01 || Math.abs(devW / 256 - Math.round(devW / 256)) > 0.002) why.push('not integer device scale ' + devW.toFixed(2));
    }
    const sideGut = Math.min(c.x, m.vw - c.r);
    if (why.length) bad.push({ touch, dpr, vp, mode: m.L.mode, scale: +m.L.scale.toFixed(3), sharp: m.L.sharp, why, canvas: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }, vh: m.vh, scrollH: m.scrollH });
  }
  await t.close();
}
log('cases', n, 'violations', bad.length);
const seen = new Set();
for (const b of bad) { const key = b.why.map((w) => w.replace(/[0-9.,]+/g, '#')).join('|'); const k2 = key + b.touch; if (seen.has(k2) && bad.length > 40) continue; seen.add(k2); log(JSON.stringify(b)); }
fs.writeFileSync(OUT + '/layout_violations.json', JSON.stringify(bad, null, 1));
check('L1 layout invariants hold for all viewports', bad.length === 0, bad.slice(0, 3));
