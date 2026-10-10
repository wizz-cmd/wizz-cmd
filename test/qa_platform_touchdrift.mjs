// QA platform: thumb drift. How far can a finger wander off a held ◀/▶/JUMP button before the input is released? Also the dead gap between ◀ and ▶ (slide).
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b, viewport: { width: 390, height: 844 }, dpr: 3, touch: true });
const cdp = t.cdp;
const rect = (k) => ev(t.page, (k) => { const r = document.querySelector('[data-k="' + k + '"]').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; }, k);
const held = () => ev(t.page, () => [...document.querySelectorAll('#touch .on')].map((b) => b.dataset.k));
const touch = (type, x, y, id = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
for (const k of ['right', 'left', 'jump']) {
  const R = await rect(k);
  for (const [dir, dx, dy] of [['above', 0, -1], ['below', 0, 1], ['outward-side', k === 'left' ? -1 : 1, 0]]) {
    // press at the centre, then drift outward in 4 px steps until released
    await touch('touchStart', R.cx, R.cy); await t.page.waitForTimeout(40);
    let released = null;
    for (let d = 2; d <= 80; d += 2) {
      const edgeDist = dy ? (dy < 0 ? (R.cy - R.t) : (R.b - R.cy)) : (R.r - R.l) / 2;
      await touch('touchMove', R.cx + dx * (edgeDist + d - (edgeDist)), R.cy + dy * d);
      // position beyond the edge = (centre offset) ; compute outside distance
      const off = dy ? (d - (dy < 0 ? (R.cy - R.t) : (R.b - R.cy))) : (d - (R.r - R.l) / 2);
      await t.page.waitForTimeout(8);
      if (!(await held()).includes(k)) { released = d; break; }
    }
    await touch('touchEnd'); await t.page.waitForTimeout(40);
    const half = dy ? (R.b - R.t) / 2 : (R.r - R.l) / 2;
    log(`${k.padEnd(5)} drift ${dir.padEnd(12)} released after moving ${released}px from centre = ${released == null ? 'never' : (released - half).toFixed(0) + 'px beyond the button edge'}  (button half-size ${half.toFixed(0)}px)`);
  }
}
const L = await rect('left'), Rr = await rect('right');
log('gap between ◀ and ▶:', (Rr.l - L.r).toFixed(1), 'px');
await t.close(); await b.close();
