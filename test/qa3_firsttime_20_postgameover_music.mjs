// Step 20: after GAME OVER (real-time), is there music on the next screen? Variant A (score 0 -> scores) and B (score>0 -> entry). Repeat N times.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
async function run(variant, tag) {
  const t = await open({ w: 1280, h: 800, name: 'pgm' });
  await wait(500);
  const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
  await wait(300);
  await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(3300);
  await t.ev((v) => { fz.Game.debug.setPlayer(0, { lives: 1 }); if (v === 'B') fz.Game.debug.addScore(0, 4300); }, variant);
  let sc = '';
  for (let i = 0; i < 600; i++) { sc = await t.scene(); if (sc === 'entry' || sc === 'scores') break; await wait(50); }
  const at = Date.now();
  const samples = [];
  for (let i = 0; i < 12; i++) { await wait(500); const a = await t.audio(); samples.push(`${((Date.now() - at) / 1000).toFixed(1)}s mus=${a.st.music} jin=${a.st.jingle} rms=${a.lvl.rms.toFixed(3)}`); }
  const silent = samples.slice(2).every((s) => /mus=null jin=null/.test(s));
  console.log(`[${variant}${tag}] scene=${sc}`); console.log('   ' + samples.join('\n   '));
  await t.close();
  return { sc, silent };
}
const out = [];
for (const [v, n] of [['A', 1], ['B', 1], ['B', 2]]) out.push([v, await run(v, n)]);
for (const [v, r] of out) check(`after GAME OVER (${v}): the next screen (${r.sc}) has music`, !r.silent, r);
