// Step 17: walk away on the title: attract cycle timeline (story -> howto x6 -> scores -> title), music continuity, what a keypress does mid-attract
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'att' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
await t.ev(() => { window.__ev = []; const A = fz.AUDIO; for (const k of ['music', 'jingle']) { const o = A[k]; A[k] = function (...a) { window.__ev.push(k + ':' + a[0]); return o.apply(this, a); }; } });
const T0 = Date.now(); let last = ''; const tl = [];
let shots = 0;
while (Date.now() - T0 < 52000) {
  const s = await t.ev(() => ({ sc: fz.scene(), t: fz._main.sceneTime() }));
  if (s.sc !== last) { tl.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + s.sc); last = s.sc; if (s.sc === 'story') { await wait(2800); await t.shot('0_attract_story', { canvas: true }); } }
  await wait(400);
}
console.log(tl.join('\n'));
console.log('music calls', JSON.stringify(await t.ev(() => window.__ev)));
console.log('audio', JSON.stringify((await t.audio()).st));
console.log('errors', t.errors);
await t.close();
