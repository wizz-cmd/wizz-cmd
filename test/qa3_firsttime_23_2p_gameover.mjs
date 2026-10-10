// Step 23: 2P game over -> two successive name entries -> scores with both highlighted (real keys)
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'p2go' });
await wait(500);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
await t.key('ArrowDown', 60); await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(3300);
console.log('players', (await t.st()).players.length);
await t.ev(() => { const D = fz.Game.debug; D.setPlayer(0, { lives: 1 }); D.setPlayer(1, { lives: 1 }); D.addScore(0, 4300); D.addScore(1, 9000); });
let tl = [], last = '';
const T0 = Date.now();
for (let i = 0; i < 900; i++) {
  const s = await t.ev(() => { const st = fz.Game.debug.state(); return fz.scene() + '/' + st.phase + '/' + st.players.map(p => p.state).join(','); });
  if (s !== last) { tl.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + s); last = s; }
  const sc = await t.scene();
  if (sc === 'entry') break;
  await wait(100);
}
console.log(tl.join('\n'));
await wait(500);
await t.shot('0_entry_first', { canvas: true });
console.log('entry', JSON.stringify(await t.ev(() => fz._main.entry())));
await t.key('Space', 60); await t.key('Space', 60); await t.key('Space', 60);
await wait(1200);
console.log('entry 2', JSON.stringify(await t.ev(() => fz._main.entry())), await t.scene());
await t.shot('1_entry_second', { canvas: true });
await t.key('Space', 60); await t.key('Space', 60); await t.key('Space', 60);
await wait(1500);
console.log('scene', await t.scene());
await t.shot('2_scores_both', { canvas: true });
console.log('errors', t.errors);
await t.close();
