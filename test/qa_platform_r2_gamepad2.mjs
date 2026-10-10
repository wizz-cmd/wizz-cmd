// Gamepad edge cases through the real loop: D-pad, B/X fire, Start pause, pad-1 A joins P2 in 1P, phantom HID device in slot 0, slot shuffle on unplug.
import { open, ev, sleep } from './qa_platform_r2_lib.mjs';
const gpInit = `(() => { window.__gp = { pads: [null, null, null, null] };
  navigator.getGamepads = () => window.__gp.pads;
  window.__mk = (o) => Object.assign({ id: 'Fake Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }, o);
  window.__btn = (...idx) => { const b = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })); idx.forEach((i) => { b[i] = { pressed: true, touched: true, value: 1 }; }); return b; };
})();`;
const t = await open({ initScript: gpInit, autoplay: true });
const P = () => ev(t.page, () => { const s = fz.Game.debug.state(); return { n: s.players.length, p: s.players.map((p) => ({ x: +p.x.toFixed(0), y: +p.y.toFixed(0), lives: p.lives })), paused: fz._main.paused(), bubbles: s.bubbles.length }; });
await ev(t.page, () => { fz.start(1, 2, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await sleep(400);
const out = {};
let a = await P();
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ buttons: window.__btn(15) }); }); await sleep(400);
let b = await P(); out.dpadRight = { dx: b.p[0].x - a.p[0].x };
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ buttons: window.__btn(2) }); }); await sleep(200);
out.fireX = { bubbles: (await P()).bubbles };
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ buttons: window.__btn(9) }); }); await sleep(150);
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({}); }); await sleep(150);
out.startPauses = { paused: (await P()).paused };
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ buttons: window.__btn(9) }); }); await sleep(150);
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({}); }); await sleep(150);
out.startResumes = { paused: (await P()).paused };
// pad-1 A joins P2 in a 1P game
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({}); window.__gp.pads[1] = window.__mk({ index: 1, buttons: window.__btn(0) }); }); await sleep(200);
out.pad1A_join = { players: (await P()).n };
// phantom HID device in slot 0 (0 buttons, 0 axes), real pad in slot 1: who controls P1?
await ev(t.page, () => { fz.start(1, 2, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await sleep(300);
a = await P();
await t.page.evaluate(() => { window.__gp.pads[0] = window.__mk({ id: 'Wireless Receiver (Vendor: 046d)', mapping: '', axes: [], buttons: [] }); window.__gp.pads[1] = window.__mk({ index: 1, axes: [1, 0, 0, 0] }); }); await sleep(500);
b = await P();
out.phantomPadInSlot0 = { realPadStickRight_p1_dx: b.p[0].x - a.p[0].x, players: b.n, note: 'stick on the REAL pad (slot 1) must move P1; 0 means the phantom device stole P1' };
console.log(JSON.stringify(out, null, 1), JSON.stringify(t.errors));
await t.close();
