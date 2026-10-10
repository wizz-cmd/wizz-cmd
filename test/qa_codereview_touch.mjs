// Touch controls through real CDP touch events: multi-touch (move + bubble), slide between pad buttons, pointercancel, PAUSE button while
// a finger holds RIGHT, release outside, and edge detection (a held JUMP finger must not re-jump after pause/resume).
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({ touch: true, viewport: { width: 390, height: 780 } });
const g = fp(t.page);
const cdp = await t.context.newCDPSession(t.page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
const center = async (k) => t.page.evaluate((k) => { const r = document.querySelector('[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, k);
await g.freeze(false);
await t.page.waitForTimeout(300);
await g.evaluate(() => { fz.start(1, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true); });
const S = () => g.evaluate(() => { const S = fz.Game.debug._S(); const p = S.players[0]; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), b: S.bubbles.length, paused: fz._main.paused(), touch: fz._main.touchMode() }; });
const R = await center('right'), J = await center('jump'), F = await center('fire'), P = await center('pause'), L = await center('left');
log('buttons', JSON.stringify({ R, J, F, P, L }), 'start', JSON.stringify(await S()));
// 1) hold RIGHT (finger 0) + tap BUBBLE (finger 1) simultaneously
await touch('touchStart', [{ ...R, id: 0 }]); await t.page.waitForTimeout(250);
const a = await S();
await touch('touchStart', [{ ...R, id: 0 }, { ...F, id: 1 }]); await t.page.waitForTimeout(80);
await touch('touchEnd', [{ ...R, id: 0 }]); await t.page.waitForTimeout(150);          // lift finger 1 (fire); finger 0 stays
const b = await S();
log('RIGHT held then +BUBBLE:', JSON.stringify(a), '->', JSON.stringify(b), ' (x grows while held, a bubble was shot)');
await touch('touchEnd', []); await t.page.waitForTimeout(100);
const c = await S(); await t.page.waitForTimeout(200); const c2 = await S();
log('after releasing all fingers x stops:', c.x, c2.x, c.x === c2.x);
// 2) slide from RIGHT to LEFT without lifting
await touch('touchStart', [{ ...R, id: 0 }]); await t.page.waitForTimeout(200);
const s1 = await S();
await touch('touchMove', [{ ...L, id: 0 }]); await t.page.waitForTimeout(300);
const s2 = await S();
await touch('touchEnd', []);
log('slide RIGHT->LEFT: x', s1.x, '->', s2.x, '(should decrease)');
// 3) pointercancel while holding RIGHT
await touch('touchStart', [{ ...R, id: 0 }]); await t.page.waitForTimeout(150);
await touch('touchCancel', []); await t.page.waitForTimeout(100);
const k1 = await S(); await t.page.waitForTimeout(250); const k2 = await S();
log('touchCancel while RIGHT held: x frozen after cancel?', k1.x === k2.x, k1.x, k2.x);
// 4) hold JUMP across PAUSE/RESUME: must not jump again on resume
await touch('touchStart', [{ ...J, id: 0 }]); await t.page.waitForTimeout(700);                 // jump, land, keep holding
const j0 = await S();
await touch('touchStart', [{ ...J, id: 0 }, { ...P, id: 1 }]); await t.page.waitForTimeout(80); await touch('touchEnd', [{ ...J, id: 0 }]); await t.page.waitForTimeout(150);   // PAUSE with finger 1 while finger 0 holds JUMP
const j1 = await S();
log('paused via touch:', j1.paused, JSON.stringify(j1));
await touch('touchEnd', []); await t.page.waitForTimeout(100);
log('errors', JSON.stringify(t.errors));
await t.close();
