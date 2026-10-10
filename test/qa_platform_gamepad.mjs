// QA platform: gamepad path with a faked navigator.getGamepads (standard mapping).
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `
  window.__pads = [null, null, null, null];
  const mk = (index, over) => ({ id: 'Fake Pad (STANDARD GAMEPAD)', index, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), ...over });
  window.__mk = mk;
  window.__setBtn = (i, n, v) => { const p = window.__pads[i]; p.buttons[n] = { pressed: !!v, touched: !!v, value: v ? 1 : 0 }; };
  navigator.getGamepads = () => window.__pads;
`;
const browser = await launchBrowser({ autoplay: true });
const t = await open({ browser, initScript: init });
const P = t.page;
const st = () => ev(P, () => { const S = fz.Game.debug._S(); return { p: S.players.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), g: p.onGround, lives: p.lives })), b: S.bubbles.length, paused: fz._main.paused(), scene: fz.scene(), players: S.players.length }; });
const set = (fn, ...a) => ev(P, fn, ...a);
// ---- title menu with stick / d-pad / A / B
await set(() => { window.__pads[0] = window.__mk(0); });
await P.waitForTimeout(200);
await set(() => { window.__setBtn(0, 13, true); }); await P.waitForTimeout(120); await set(() => { window.__setBtn(0, 13, false); });
await P.waitForTimeout(100);
log('title: dpad down once; scene', await set(() => fz.scene()));
await set(() => { window.__pads[0].axes[1] = 0.9; }); await P.waitForTimeout(450); await set(() => { window.__pads[0].axes[1] = 0; });
// ---- start a 1P game directly, test gameplay inputs
await set(() => { fz.start(1, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true); });
await P.waitForTimeout(200);
let a = await st(); await set(() => { window.__pads[0].axes[0] = 0.9; }); await P.waitForTimeout(300); let b = await st(); await set(() => { window.__pads[0].axes[0] = 0; });
log('stick right: x', a.p[0].x, '->', b.p[0].x);
a = b; await set(() => { window.__setBtn(0, 14, true); }); await P.waitForTimeout(300); b = await st(); await set(() => { window.__setBtn(0, 14, false); });
log('dpad left: x', a.p[0].x, '->', b.p[0].x);
a = await st(); await set(() => { window.__pads[0].axes[0] = 0.3; }); await P.waitForTimeout(300); b = await st(); await set(() => { window.__pads[0].axes[0] = 0; });
log('stick 0.3 (inside dead zone .45): x', a.p[0].x, '->', b.p[0].x, '(no move expected)');
a = await st(); await set(() => { window.__setBtn(0, 0, true); }); await P.waitForTimeout(150); b = await st(); await set(() => { window.__setBtn(0, 0, false); });
log('A jump: y', a.p[0].y, '->', b.p[0].y);
await P.waitForTimeout(700);
for (const [n, nm] of [[1, 'B'], [2, 'X'], [3, 'Y'], [5, 'RB'], [7, 'RT']]) { a = await st(); await set((n) => { window.__setBtn(0, n, true); }, n); await P.waitForTimeout(100); await set((n) => { window.__setBtn(0, n, false); }, n); await P.waitForTimeout(250); b = await st(); log(nm, 'bubbles', a.b, '->', b.b); }
// Start toggles pause
await set(() => { window.__setBtn(0, 9, true); }); await P.waitForTimeout(100); await set(() => { window.__setBtn(0, 9, false); }); await P.waitForTimeout(100);
log('Start -> paused', (await st()).paused);
await set(() => { window.__setBtn(0, 9, true); }); await P.waitForTimeout(100); await set(() => { window.__setBtn(0, 9, false); }); await P.waitForTimeout(100);
log('Start again -> paused', (await st()).paused);
// pad 1 A joins the 1P game
await set(() => { window.__pads[1] = window.__mk(1); });
await P.waitForTimeout(100);
await set(() => { window.__setBtn(1, 0, true); }); await P.waitForTimeout(120); await set(() => { window.__setBtn(1, 0, false); });
await P.waitForTimeout(200);
log('pad1 A in 1P game -> players', (await st()).players);
// pad only at index 1 (pad 0 slot empty) -> acts as P1?
await set(() => { window.__pads[0] = null; window.__pads[1] = window.__mk(1); fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); });
await P.waitForTimeout(200);
a = await st(); await set(() => { window.__pads[1].axes[0] = 0.9; }); await P.waitForTimeout(300); b = await st(); await set(() => { window.__pads[1].axes[0] = 0; });
log('2P game, only pad slot 1 present, stick right: P1 x', a.p[0].x, '->', b.p[0].x, ' P2 x', a.p[1].x, '->', b.p[1].x);
// disconnect during hold
await set(() => { window.__pads[1] = window.__mk(1); window.__pads[1].axes[0] = 0.9; }); await P.waitForTimeout(200);
await set(() => { window.__pads[1] = null; }); await P.waitForTimeout(300);
a = await st(); await P.waitForTimeout(300); b = await st();
log('pad unplugged while stick held: x stable?', a.p[0].x === b.p[0].x, a.p[0].x, b.p[0].x);
// getGamepads throwing / returning null
await set(() => { navigator.getGamepads = () => { throw new DOMException('no', 'SecurityError'); }; });
await P.waitForTimeout(400);
log('getGamepads throwing: scene alive', await set(() => fz.scene()), 'errors', JSON.stringify(t.errors));
await set(() => { navigator.getGamepads = () => null; }); await P.waitForTimeout(300);
log('getGamepads null: errors', JSON.stringify(t.errors));
await t.close(); await browser.close();
