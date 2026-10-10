// Gamepad code paths through the real loop with a fake navigator.getGamepads(): P1 move/jump/fire, pad-1 A joins P2,
// Start pauses/resumes, pad unplug shifting (pad 1 becomes P1).
import { launch, fp, log } from './qa_codereview_lib.mjs';
const init = `
window.__pads = [null, null];
const mk = (i) => ({ index: i, connected: true, id: 'fake' + i, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
window.__mk = mk;
navigator.getGamepads = () => window.__pads.slice();
`;
const t = await launch({ initScript: init });
const g = fp(t.page);
await t.page.evaluate(() => { window.__pads[0] = window.__mk(0); });
await t.page.keyboard.press('ShiftRight');
await g.evaluate(() => { fz.start(1, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true); });
const S = () => g.evaluate(() => { const S = fz.Game.debug._S(); return { n: S.players.length, x0: Math.round(S.players[0].x), y0: Math.round(S.players[0].y), x1: S.players[1] ? Math.round(S.players[1].x) : null, paused: fz._main.paused(), bubbles: S.bubbles.length }; });
log('start       ', JSON.stringify(await S()));
await t.page.evaluate(() => { window.__pads[0].axes = [1, 0]; }); await t.page.waitForTimeout(400);
await t.page.evaluate(() => { window.__pads[0].axes = [0, 0]; });
log('P1 stick right', JSON.stringify(await S()));
await t.page.evaluate(() => { window.__pads[0].buttons[1].pressed = true; }); await t.page.waitForTimeout(100);
await t.page.evaluate(() => { window.__pads[0].buttons[1].pressed = false; });
log('P1 B (bubble)', JSON.stringify(await S()));
// second pad connects; its A joins P2
await t.page.evaluate(() => { window.__pads[1] = window.__mk(1); });
await t.page.waitForTimeout(100);
await t.page.evaluate(() => { window.__pads[1].buttons[0].pressed = true; }); await t.page.waitForTimeout(120);
await t.page.evaluate(() => { window.__pads[1].buttons[0].pressed = false; });
log('pad1 A joins ', JSON.stringify(await S()));
await t.page.evaluate(() => { window.__pads[1].axes = [-1, 0]; }); await t.page.waitForTimeout(300);
await t.page.evaluate(() => { window.__pads[1].axes = [0, 0]; });
log('P2 stick left', JSON.stringify(await S()));
// Start -> pause, Start -> resume
await t.page.evaluate(() => { window.__pads[0].buttons[9].pressed = true; }); await t.page.waitForTimeout(100);
await t.page.evaluate(() => { window.__pads[0].buttons[9].pressed = false; }); await t.page.waitForTimeout(100);
log('Start (pause)', JSON.stringify(await S()));
await t.page.evaluate(() => { window.__pads[0].buttons[9].pressed = true; }); await t.page.waitForTimeout(100);
await t.page.evaluate(() => { window.__pads[0].buttons[9].pressed = false; }); await t.page.waitForTimeout(100);
log('Start (resume)', JSON.stringify(await S()));
// unplug pad 0: pad 1 silently becomes P1's controller
await t.page.evaluate(() => { window.__pads[0] = null; window.__pads[1].axes = [1, 0]; });
const before = await S(); await t.page.waitForTimeout(300);
const after = await S();
await t.page.evaluate(() => { window.__pads[1].axes = [0, 0]; });
log('pad0 unplugged, pad1 stick right: P1 x', before.x0, '->', after.x0, ' P2 x', before.x1, '->', after.x1, '(P2 pad now drives P1)');
log('errors', t.errors);
await t.close();
