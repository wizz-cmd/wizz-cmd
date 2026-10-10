// Keyboard + gamepad behaviour through the REAL RAF loop (not step()).
import { open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const out = {};
const gpInit = `(() => { window.__gp = { pads: [null, null, null, null], throwNext: false };
  const real = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
  navigator.getGamepads = () => { if (window.__gp.throwNext) throw new Error('boom'); return window.__gp.pads; };
  window.__mk = (o) => Object.assign({ id: 'Fake Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
     buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), timestamp: 0 }, o);
})();`;
const t = await open({ initScript: gpInit, autoplay: true });
const P = () => ev(t.page, () => { const s = fz.Game.debug.state(); return { scene: fz.scene(), phase: s.phase, p: s.players.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(2), onGround: p.onGround, alive: p.alive })), paused: fz._main.paused() }; });
await ev(t.page, () => { fz.start(2, 1, 7); fz.Game.debug.god(true); });
await sleep(3200);   // intro
out.afterIntro = await P();
// ---- A. key combos (software side): everything down at once
await t.page.keyboard.down('ArrowRight'); await t.page.keyboard.down('ArrowUp'); await t.page.keyboard.down('Space');
await t.page.keyboard.down('KeyA'); await t.page.keyboard.down('KeyW'); await t.page.keyboard.down('KeyQ');
await sleep(120);
out.combo_both_down = await P();
await t.page.keyboard.up('ArrowRight'); await t.page.keyboard.up('ArrowUp'); await t.page.keyboard.up('Space');
await t.page.keyboard.up('KeyA'); await t.page.keyboard.up('KeyW'); await t.page.keyboard.up('KeyQ');
await sleep(800);
// ---- B. blur while ArrowRight held; key released while blurred; refocus; is the key stuck?
const x0 = (await P()).p[0].x;
await t.page.keyboard.down('ArrowRight'); await sleep(300);
const x1 = (await P()).p[0].x;
await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
await sleep(200);
out.blur = { x0, x1, paused: (await P()).paused };
await t.page.keyboard.up('ArrowRight');           // keyup arrives (page has real focus in headless), but state must already be released
await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
await ev(t.page, () => fz._main.setPaused(false)); await sleep(400);
const x2 = (await P()).p[0].x; await sleep(400); const x3 = (await P()).p[0].x;
out.afterRefocusNoKey = { x2, x3, stuck: Math.abs(x3 - x2) > 0.5 };
// ---- C. key held across blur/focus, still physically held: does OS repeat re-register? (keydown repeat:true)
await t.page.keyboard.down('ArrowLeft'); await sleep(200);
await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
await ev(t.page, () => fz._main.setPaused(false)); await sleep(150);
const y0 = (await P()).p[0].x;
await t.page.keyboard.down('ArrowLeft'); await t.page.keyboard.down('ArrowLeft'); // playwright sends repeat:true when already down
await sleep(500);
const y1 = (await P()).p[0].x;
out.heldThroughBlur = { y0, y1, moves: Math.abs(y1 - y0) > 1, note: 'physically held key after refocus: moves=false means player must lift & re-press' };
await t.page.keyboard.up('ArrowLeft');
// ---- D. Ctrl/Meta combos swallowed? (Ctrl+Space etc)
await t.page.keyboard.down('Control'); await t.page.keyboard.down('ArrowRight'); await sleep(250);
const z1 = (await P()).p[0].x; await t.page.keyboard.up('ArrowRight'); await t.page.keyboard.up('Control');
out.ctrlArrow = { before: y1, after: z1, moved: Math.abs(z1 - y1) > 1 };
// ---- E. gamepad (fake, standard mapping)
await sleep(300);
const gx0 = (await P()).p[0].x;
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ axes: [0.9, 0, 0, 0] }); });
await sleep(400);
const gx1 = (await P()).p[0].x;
out.pad_stick_right = { gx0, gx1, moved: gx1 - gx0 };
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ axes: [0.3, 0, 0, 0] }); });  // inside dead zone
const gd0 = (await P()).p[0].x; await sleep(400); const gd1 = (await P()).p[0].x;
out.pad_deadzone_0_3 = { moved: +(gd1 - gd0).toFixed(2) };
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ axes: [0.5, 0, 0, 0] }); });
const gd2 = (await P()).p[0].x; await sleep(400); const gd3 = (await P()).p[0].x;
out.pad_deadzone_0_5 = { moved: +(gd3 - gd2).toFixed(2) };
// dpad + A jump
await t.page.evaluate(() => { const b = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); b[0] = { pressed: true, value: 1 }; window.__gp.pads[0] = window.__mk({ buttons: b }); });
await sleep(120); const jy = (await P()).p[0]; out.pad_A_jump = { y: jy.y, onGround: jy.onGround };
await t.page.evaluate(() => { window.__gp.pads[0] = null; }); await sleep(100);
// pad disconnect with button held -> released?
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ axes: [-1, 0, 0, 0] }); }); await sleep(250);
const dc0 = (await P()).p[0].x;
await t.page.evaluate(() => { window.__gp.pads[0] = null; }); await sleep(400);
const dc1 = (await P()).p[0].x; await sleep(300); const dc2 = (await P()).p[0].x;
out.pad_disconnect_midpress = { stillMovingAfterDisconnect: Math.abs(dc2 - dc1) > 1 };
// getGamepads throwing
await t.page.evaluate(() => { window.__gp.throwNext = true; }); await sleep(300);
out.pad_throw_errors = t.errors.slice();
await t.page.evaluate(() => { window.__gp.throwNext = false; });
// non-standard mapping (e.g. generic USB pad: id with mapping '') — buttons indices differ; do we check mapping?
out.mappingCheck = await ev(t.page, () => /mapping/.test(String(fz.Game) ) ? 'n/a' : 'see grep');
// pad in slot 1 only (slot 0 null): who is P1?
await t.page.evaluate(() => { window.__gp.pads[0] = null; window.__gp.pads[1] = window.__mk({ index: 1, axes: [-1, 0, 0, 0] }); });
const s0 = await P(); await sleep(400); const s1 = await P();
out.pad_in_slot1_only = { p1dx: +(s1.p[0].x - s0.p[0].x).toFixed(1), p2dx: +(s1.p[1].x - s0.p[1].x).toFixed(1) };
out.errors = t.errors;
save('input.json', out);
console.log(JSON.stringify(out, null, 1));
await t.close();
