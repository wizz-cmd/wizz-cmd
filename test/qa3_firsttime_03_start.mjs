// Step 3: title -> 1 PLAYER (Enter) -> story -> play intro -> first round; timeline of scene/phase/audio, screenshots
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const via = process.argv[2] || 'Enter';
const t = await open({ w: 1280, h: 800, name: 'd_start_' + via });
await wait(800);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(1200);
const t0 = Date.now();
const log = [];
const sample = async (tag) => {
  const s = await t.ev(() => { const st = fz.Game.debug.state(); const a = fz.AUDIO._state(); return { scene: fz.scene(), ph: st && st.phase, lvl: st && st.level, f: st && st.frame, mus: a.music, jin: a.jingle, ctx: a.ctxState, bub: st && st.bubbles && st.bubbles.length }; });
  const lv = await t.ev(() => window.__level && window.__level());
  console.log(((Date.now() - t0) / 1000).toFixed(2) + 's', tag || '', JSON.stringify(s), lv ? 'rms=' + lv.rms.toFixed(3) : '');
  return s;
};
await sample('title');
await t.key(via, 80);
await sample('just after confirm');
for (let i = 0; i < 6; i++) { await wait(500); await sample(); }
await t.shot('1_story_mid', { canvas: true });
await wait(2000);
await sample('story end?');
await t.shot('2_after_story', { canvas: true });
for (let i = 0; i < 12; i++) { await wait(400); const s = await sample(); if (i === 3) await t.shot('3_intro', { canvas: true }); }
await t.shot('4_play', { canvas: true });
const st = await t.st();
console.log('bubbles', st.bubbles.length, 'players', JSON.stringify(st.players));
console.log('errors', t.errors);
await t.close();
