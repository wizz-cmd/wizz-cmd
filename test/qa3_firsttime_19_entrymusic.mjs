// Step 19: does the `entry` loop actually play on the name-entry screen after the game-over jingle? (suspicious: state().music null for 4 s)
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'entm' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
await t.ev(() => {
  window.__ev = []; const A = fz.AUDIO;
  for (const k of ['music', 'jingle', 'stopMusic']) { const o = A[k]; A[k] = function (...a) { window.__ev.push({ k, a: String(a[0]), sc: fz.scene(), t: Math.round(performance.now()) }); return o.apply(this, a); }; }
  window.__rec = [];
  setInterval(() => { const l = window.__level(); const s = fz.AUDIO._state(); window.__rec.push({ t: Math.round(performance.now()), sc: fz.scene(), mus: s.music, jin: s.jingle, rms: l && l.rms }); }, 100);
});
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(3500);
await t.ev(() => { fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 4300); });
let sc = '';
for (let i = 0; i < 400; i++) { sc = await t.scene(); if (sc === 'entry') break; await wait(100); }
await wait(8000);
const rec = await t.ev(() => window.__rec);
const ev = await t.ev(() => window.__ev);
const t0 = (ev.find((e) => e.sc === 'entry') || { t: 0 }).t;
console.log('events', JSON.stringify(ev.map((e) => `${e.a}/${e.k}@${e.sc}+${((e.t - t0) / 1000).toFixed(1)}`)));
let last = '';
for (const r of rec) { if (r.sc === 'entry' || (r.t - t0) > -5000) { const k = `${r.sc}|${r.mus}|${r.jin}`; if (k !== last) { console.log(((r.t - t0) / 1000).toFixed(1) + 's', k, 'rms', r.rms && r.rms.toFixed(3)); last = k; } } }
const inEntry = rec.filter((r) => r.sc === 'entry' && r.t - t0 > 1500);
const rm = Math.sqrt(inEntry.reduce((s, r) => s + (r.rms || 0) ** 2, 0) / inEntry.length);
console.log('entry steady-state rms dBFS', (20 * Math.log10(rm)).toFixed(1), 'music names', [...new Set(inEntry.map((r) => r.mus))]);
console.log('errors', t.errors);
await t.close();
