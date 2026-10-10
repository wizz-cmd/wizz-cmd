// Multi-touch through CDP Input.dispatchTouchEvent in a mobile-emulated page. Real RAF loop.
import { open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const out = {};
for (const [name, w, h] of [['p390', 390, 844], ['l844', 844, 390], ['p360', 360, 740]]) {
  const t = await open({ viewport: { width: w, height: h }, touch: true, dpr: 3, autoplay: true, colorScheme: 'dark' });
  const cdp = t.cdp;
  const rects = await t.page.evaluate(() => { const o = {}; document.querySelectorAll('#touch [data-k]').forEach((b) => { const r = b.getBoundingClientRect(); o[b.dataset.k] = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height, x: r.x, y: r.y }; }); return o; });
  const P = () => ev(t.page, () => { const s = fz.Game.debug.state(); const p = s.players[0]; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), g: p.onGround, bubbles: s.bubbles.length, scene: fz.scene(), paused: fz._main.paused() }; });
  const on = () => t.page.evaluate(() => [...document.querySelectorAll('#touch [data-k].on')].map((b) => b.dataset.k));
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y, radiusX: 20, radiusY: 20, force: 1 })) });
  await ev(t.page, () => { fz.start(1, 1, 3); fz.Game.debug.god(true); });
  await sleep(3000);
  const r = rects;
  const o = { rects: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.w.toFixed(0)}x${v.h.toFixed(0)}@(${v.x.toFixed(0)},${v.y.toFixed(0)})`])) };
  o.start = await P();
  // 1) left + jump + fire simultaneously
  const L = r.left, J = r.jump, F = r.fire, R = r.right;
  await touch('touchStart', [[1, L.cx, L.cy], [2, J.cx, J.cy], [3, F.cx, F.cy]]);
  await sleep(80);
  o.simul_on = await on();
  const s1 = await P();
  await sleep(120);
  const s2 = await P();
  o.simul = { start: o.start, s1, s2 };
  await touch('touchEnd', []);
  await sleep(1200);
  // 2) hold right with finger 1, then tap jump with finger 2 repeatedly while finger 1 stays
  const a0 = await P();
  await touch('touchStart', [[1, R.cx, R.cy]]); await sleep(300);
  await touch('touchStart', [[1, R.cx, R.cy], [2, J.cx, J.cy]]); await sleep(100);
  await touch('touchEnd', [[1, R.cx, R.cy]]); await sleep(150);       // lift jump finger only
  const a1 = await P(); o.right_held_jump_tap = { a0, a1, on: await on() };
  // 3) slide from RIGHT to LEFT without lifting
  await touch('touchMove', [[1, L.cx, L.cy]]); await sleep(300);
  o.slide_to_left_on = await on();
  await touch('touchEnd', []); await sleep(100);
  o.after_release_on = await on();
  // 4) slide finger off the buttons entirely -> release?
  await touch('touchStart', [[1, R.cx, R.cy]]); await sleep(100);
  await touch('touchMove', [[1, R.cx, R.cy - 200]]); await sleep(150);
  o.slide_off_on = await on();
  await touch('touchEnd', []);
  // 5) touch-action computed + zoom behaviour
  o.touchAction = await t.page.evaluate(() => ({ html: getComputedStyle(document.documentElement).touchAction, body: getComputedStyle(document.body).touchAction, canvas: getComputedStyle(document.getElementById('screen')).touchAction, touch: getComputedStyle(document.getElementById('touch')).touchAction, userSelectBody: getComputedStyle(document.body).userSelect, overscroll: getComputedStyle(document.documentElement).overscrollBehavior, viewportMeta: document.querySelector('meta[name=viewport]').content }));
  // pinch on blank area (above canvas) and on canvas
  const scale0 = await t.page.evaluate(() => visualViewport.scale);
  await cdp.send('Input.synthesizePinchGesture', { x: w / 2, y: 60, scaleFactor: 2.2, relativeSpeed: 800 }).catch((e) => { o.pinchErr = String(e).slice(0, 80); });
  await sleep(300);
  const scaleBlank = await t.page.evaluate(() => visualViewport.scale);
  await t.page.evaluate(() => window.scrollTo(0, 0));
  o.pinch = { scale0, scaleAfterPinchOnBlank: scaleBlank };
  // 6) double-tap on blank area
  await cdp.send('Input.synthesizeTapGesture', { x: 20, y: 30, tapCount: 2 }).catch(() => {}); await sleep(400);
  o.doubleTapScale = await t.page.evaluate(() => visualViewport.scale);
  // 7) scroll attempt: swipe up on blank area and on canvas
  const sy0 = await t.page.evaluate(() => scrollY);
  await cdp.send('Input.synthesizeScrollGesture', { x: w / 2, y: 120, yDistance: -200, speed: 800 }).catch(() => {}); await sleep(300);
  o.scrollY = { before: sy0, after: await t.page.evaluate(() => scrollY), docH: await t.page.evaluate(() => document.documentElement.scrollHeight), vh: h };
  o.errors = t.errors;
  out[name] = o;
  await t.page.screenshot({ path: `${(await import('./qa_platform_r2_lib.mjs')).OUT}/touch_${name}.png` });
  await t.close();
}
save('touch.json', out);
console.log(JSON.stringify(out, null, 1));
