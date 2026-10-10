// QA platform: touch UI driven with a MOUSE (hybrid laptop / emulator / Chromebook): press ◀, drag off the controls, release elsewhere -> stuck input?
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b, viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
await ev(t.page, () => { fz.start(1, 1, 3); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true); });
const c = await ev(t.page, () => { const r = document.querySelector('[data-k="left"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const pos = () => ev(t.page, () => ({ x: +fz.Game.debug._S().players[0].x.toFixed(1), on: [...document.querySelectorAll('#touch .on')].map((b) => b.dataset.k), type: fz._main.touchMode() }));
// first move right a bit so there is room to go left
await ev(t.page, () => fz.Game.debug.setPlayer(0, { x: 150 }));
await t.page.mouse.move(c.x, c.y); await t.page.mouse.down(); await t.page.waitForTimeout(150);
log('mouse down on ◀:', JSON.stringify(await pos()));
await t.page.mouse.move(c.x, c.y - 300, { steps: 6 });        // drag up onto the canvas area
await t.page.mouse.up(); await t.page.waitForTimeout(200);
const a = await pos(); await t.page.waitForTimeout(400); const a2 = await pos();
log('released outside the controls: still pressed?', JSON.stringify(a), '-> after 400ms x', a2.x, '(moving = stuck input)');
await t.close(); await b.close();
