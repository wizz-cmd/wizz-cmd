// Step 15: round-1 clear -> transition -> round 2 intro as the newcomer sees it (realtime, real keys idle). Phase timeline + audio events.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'clr' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
await t.ev(() => {
  window.__ev = [];
  const A = fz.AUDIO;
  for (const k of ['sfx', 'jingle', 'music']) { const o = A[k]; A[k] = function (...a) { window.__ev.push({ k, a: String(a[0]), t: Math.round(performance.now()) }); return o.apply(this, a); }; }
});
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(4000);
await t.ev(() => { fz.Game.debug.god(true); fz.Game.debug.killAll(); });
const T0 = Date.now(); let last = ''; const tl = [];
let n = 0;
for (let i = 0; i < 80; i++) {
  const s = await t.ev(() => { const st = fz.Game.debug.state(); return { ph: st.phase, lvl: st.level, f: st.frame, items: st.items.length }; });
  const key = s.ph + '/L' + s.lvl;
  if (key !== last) { tl.push(((Date.now() - T0) / 1000).toFixed(2) + 's ' + key + ' items=' + s.items); last = key; if (['clear', 'transition'].includes(s.ph)) { await wait(500); await t.shot(`${n++}_${s.ph}`, { canvas: true }); } }
  if (s.lvl === 2 && s.ph === 'play') break;
  await wait(250);
}
console.log(tl.join('\n'));
await t.shot('9_round2', { canvas: true });
console.log('events', JSON.stringify(await t.ev(() => window.__ev.map((e) => e.a))));
console.log('errors', t.errors);
await t.close();
