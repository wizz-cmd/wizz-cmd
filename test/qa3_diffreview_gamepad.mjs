// Gamepad slot map with a mocked navigator.getGamepads
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const init = `
window.__pads = [null, null, null, null];
const mk = (n, o) => Object.assign({ index: n, id: 'Mock pad ' + n, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 }, o || {});
window.__mk = mk;
navigator.getGamepads = () => window.__pads.slice();
window.__press = (i, b, on = true) => { const p = window.__pads[i]; if (p) { p.buttons[b] = { pressed: on, value: on ? 1 : 0 }; } };
`;
const t = await launch({ initScript: init });
const g = fp(t.page);
const wait = (ms) => t.page.waitForTimeout(ms);
const slots = () => t.page.evaluate(() => window.__fizzpop._main.padSlots());
await g.scene();
await wait(200);
await t.page.evaluate(() => { __pads[0] = __mk(0); __pads[1] = __mk(1); });
await wait(100);
check('G0 idle pads claim nothing', (await slots()).length === 0, await slots());
await t.page.evaluate(() => __press(1, 2));       // pad index 1 presses X first
await wait(100);
log('after pad1 press', JSON.stringify(await slots()));
check('G1 first pad to press (index 1) takes P1', JSON.stringify(await slots()) === '[[1,0]]', await slots());
await t.page.evaluate(() => __press(1, 2, false));
await t.page.evaluate(() => __press(0, 0));
await wait(100);
check('G2 second pad takes P2', JSON.stringify(await slots()) === '[[1,0],[0,1]]', await slots());
await t.page.evaluate(() => { __press(0, 0, false); __pads[1] = null; });   // P1 pad unplugged
await wait(100);
check('G3 unplugging P1 pad frees slot 0, other pad stays P2', JSON.stringify(await slots()) === '[[0,1]]', await slots());
await t.page.evaluate(() => { __pads[2] = __mk(2); __press(2, 1); });
await wait(100);
check('G4 a new pad takes the free slot 0', JSON.stringify((await slots()).sort()) === JSON.stringify([[0, 1], [2, 0]]), await slots());
await t.page.evaluate(() => { __press(2, 1, false); __pads[3] = __mk(3); __press(3, 0); });
await wait(100);
check('G5 a third pad gets no slot', (await slots()).length === 2, await slots());
await t.page.evaluate(() => { __press(3, 0, false); __pads[3] = null; });
// phantom devices
await t.page.evaluate(() => { __pads[0] = null; __pads[2] = null; __pads[1] = __mk(1, { buttons: [], axes: [], mapping: '' }); __press(1, 0); });
await wait(100);
check('G6 phantom pad (no buttons/axes) never claims a slot', (await slots()).length === 0, await slots());
await t.page.evaluate(() => { __pads[1] = __mk(1, { mapping: '', buttons: Array.from({ length: 4 }, () => ({ pressed: false, value: 0 })), axes: [0, 0] }); __press(1, 0); });
await wait(100);
check('G7 generic 4-button/2-axis pad is usable', (await slots()).length === 1, await slots());
// stick drift: axis 0.3 below the dead zone? and 0.6 above
await t.page.evaluate(() => { __pads.fill(null); __pads[0] = __mk(0, { axes: [0.1, 0.1, 0, 0] }); });
await wait(100);
check('G8 tiny stick drift (0.1) does not claim a slot', (await slots()).length === 0, await slots());
// slot map persists when going to a game: title enter clears
await t.page.evaluate(() => { __pads[0].axes = [0.9, 0, 0, 0]; });
await wait(100);
log('slots after hard stick', JSON.stringify(await slots()));
log('errors', t.errors);
await t.close();
