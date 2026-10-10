// Step 18: loudness continuity across the newcomer journey (real output through an analyser on destination). Mean RMS / peak per segment.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'loud' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
await t.ev(() => {
  window.__rec = [];
  setInterval(() => {
    const l = window.__level(); if (!l) return;
    const s = fz.AUDIO._state(); const st = fz.Game.debug.state();
    window.__rec.push({ sc: fz.scene() + (fz.scene() === 'play' ? '/' + (st && st.phase) : ''), mus: s.music || s.jingle || '-', rms: l.rms, pk: l.pk });
  }, 60);
});
await wait(3500);                       // title
await t.key('Enter', 80);
await wait(4400);                       // story -> play intro (start jingle)
await wait(6500);                       // stage1 (no input: Fizz may die)
await t.ev(() => { fz.Game.debug.god(true); });
await t.key('Space', 60); await wait(300); await t.key('Space', 60);   // sfx
await wait(1500);
await t.ev(() => { fz.Game.debug.god(false); fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 4300); });
let sc = '';
for (let i = 0; i < 400; i++) { sc = await t.scene(); if (sc === 'entry') break; await wait(150); }
await wait(4500);
const rec = await t.ev(() => window.__rec);
const by = {};
for (const r of rec) { const key = r.sc + ' | ' + r.mus; (by[key] = by[key] || []).push(r); }
for (const [k, a] of Object.entries(by)) {
  const rm = Math.sqrt(a.reduce((s, r) => s + r.rms * r.rms, 0) / a.length);
  const pk = Math.max(...a.map((r) => r.pk));
  console.log(k.padEnd(30), 'n=' + String(a.length).padStart(3), 'rms(dBFS)=' + (20 * Math.log10(rm || 1e-9)).toFixed(1), 'peak=' + pk.toFixed(2));
}
console.log('errors', t.errors);
await t.close();
