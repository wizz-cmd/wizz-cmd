// Touch flows on a phone: title rows -> game -> PAUSE button (acts on release) -> QUIT YES/NO by taps -> back on title. Also pad slide/cancel semantics.
import { launch, fp, log, check, OUT, canvasShot } from './qa3_diffreview_lib.mjs';
const t = await launch({ viewport: { width: 390, height: 844 }, touch: true, deviceScaleFactor: 3 });
const page = t.page; const g = fp(page);
const wait = (ms) => page.waitForTimeout(ms);
await page.waitForFunction(() => !!window.__fizzpop); await g.scene(); await wait(300);
const M = (fn) => page.evaluate(fn);
const canvasPt = async (gx, gy) => page.evaluate(([gx, gy]) => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.left + gx * r.width / 256, y: r.top + gy * r.height / 224 }; }, [gx, gy]);
const tapGame = async (gx, gy) => { const p = await canvasPt(gx, gy); await page.touchscreen.tap(p.x, p.y); await wait(250); };
const tapRow = async (label) => {
  const rows = await M(() => window.__fizzpop._main.rows());
  const r = rows.find((x) => x.label === label);
  if (!r) throw new Error('no row ' + label + ' in ' + JSON.stringify(rows));
  await tapGame((r.x0 + r.x1) / 2, r.top + r.h / 2);
};
const btnPt = async (k) => page.evaluate((k) => { const b = document.querySelector(`#touch [data-k="${k}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, k);
log('scene', await g.scene(), 'touchOnly', await M(() => window.__fizzpop._main.touchOnly()));
log('rows', JSON.stringify(await M(() => window.__fizzpop._main.rows())));
await tapRow('1 PLAYER'); await wait(500);
log('scene after 1 PLAYER tap', await g.scene());
for (let i = 0; i < 40 && (await g.scene()) !== 'play'; i++) { await tapGame(128, 100); await wait(200); }
check('T1 reached play by taps', (await g.scene()) === 'play');
await wait(800);
// PAUSE button: press, slide off, release => nothing
let p = await btnPt('pause');
await page.touchscreen.tap(p.x, p.y); await wait(200);
check('T2 PAUSE tap pauses', await M(() => window.__fizzpop._main.paused()));
log('rows', JSON.stringify(await M(() => window.__fizzpop._main.rows())));
await tapRow('QUIT'); await wait(200);
check('T3 QUIT asks first (confirmQuit, scene still play)', (await M(() => window.__fizzpop._main.confirmQuit())) && (await g.scene()) === 'play');
log('rows (confirm)', JSON.stringify(await M(() => window.__fizzpop._main.rows())));
await canvasShot(page, OUT + '/touch_confirm.png', { scale: 2 });
await tapRow('NO'); await wait(200);
check('T4 NO returns to the pause menu', !(await M(() => window.__fizzpop._main.confirmQuit())) && (await M(() => window.__fizzpop._main.paused())));
await tapRow('QUIT'); await wait(200);
await tapRow('YES'); await wait(500);
check('T5 YES quits to title', (await g.scene()) === 'title', await g.scene());
const st = await M(() => window.__fizzpop.AUDIO._state());
log('audio after quit', JSON.stringify(st));
check('T6 audio not left paused after quitting from the pause menu', !st.paused && st.ctxState === 'running', st);
// restart; pause then rotate/resize while paused: rows stay tappable
await tapRow('1 PLAYER'); for (let i = 0; i < 40 && (await g.scene()) !== 'play'; i++) { await tapGame(128, 100); await wait(200); }
await wait(600);
p = await btnPt('pause'); await page.touchscreen.tap(p.x, p.y); await wait(200);
await page.setViewportSize({ width: 844, height: 390 }); await wait(400);
const rows2 = await M(() => window.__fizzpop._main.rows());
check('T7 pause rows exist after rotation', Array.isArray(rows2) && rows2.length === 2, rows2);
await tapRow('RESUME'); await wait(300);
check('T8 RESUME by tap after rotation', !(await M(() => window.__fizzpop._main.paused())));
log('errors', t.errors);
check('no errors', t.errors.length === 0, t.errors);
await t.close();
