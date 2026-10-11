// Distinct Canvas2D "pipeline signatures" (draw kind x composite op x paint kind x filter x alpha x shadow x clip) and WHEN each is first used.
// On a GPU canvas every new combination can mean a shader/pipeline compile at first use (20-200 ms on a phone GPU). Not measurable on this VM; this lists what to pre-warm.
import fs from 'fs';
import { open, BUSY, DRIVE, sleep, OUT } from './qa_v2_perf_lib.mjs';
const t = await open({ vw: 900, vh: 760, dpr: 1 });
await t.page.evaluate(() => {
  fz = window.__fizzpop;
  const P = window.__sig = { seen: new Map(), scene: 'boot', n: 0 };
  const kind = new WeakMap();
  const proto = CanvasRenderingContext2D.prototype;
  for (const m of ['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern']) { const o = proto[m]; proto[m] = function (...a) { const r = o.apply(this, a); try { kind.set(r, m.replace('create', '').replace('Gradient', 'Grad')); } catch (e) {} return r; }; }
  const rec = (ctx, name, src) => {
    const st = ctx.fillStyle, ss = ctx.strokeStyle;
    const paint = (name === 'stroke' || name === 'strokeRect' ? ss : st);
    const pk = typeof paint === 'string' ? 'color' : (kind.get(paint) || 'obj');
    const filt = ctx.filter && ctx.filter !== 'none' ? 'filter' : '';
    const sig = [name, ctx.globalCompositeOperation, name === 'drawImage' ? (src && src.width <= 4 ? 'img1px' : 'img') : pk, filt, ctx.globalAlpha < 1 ? 'a<1' : '', ctx.shadowBlur > 0 ? 'shadow' : '', ctx.canvas === document.getElementById('screen') ? 'main' : 'off'].filter(Boolean).join(' ');
    if (!P.seen.has(sig)) P.seen.set(sig, { first: P.scene, at: Math.round(performance.now()), n: 0 });
    P.seen.get(sig).n++;
  };
  for (const name of ['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'clearRect']) {
    const o = proto[name];
    proto[name] = function (...a) { rec(this, name, a[0]); return o.apply(this, a); };
  }
  P.mark = (s) => { P.scene = s; };
});
const mark = (s) => t.page.evaluate((s) => window.__sig.mark(s), s);
const run = async (label, fn, ms = 1200) => { await mark(label); await t.page.evaluate(fn); await sleep(ms); };
await run('title', "fz.goto('title')", 2500);
await run('howto', "fz.goto('howto')");
await run('scores', "fz.goto('scores')");
await run('story', "fz.goto('story', { next: { players: 1, level: 1, seed: 1 } })");
await run('play R1', "fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); (() => { let n = 0; window.__drive = setInterval(() => { n++; fz.input.set(0, { right: (n >> 5) % 2 === 0, left: (n >> 5) % 2 === 1, fire: n % 6 < 3, jump: n % 40 === 0 }); fz.input.set(1, { left: (n >> 5) % 2 === 0, right: (n >> 5) % 2 === 1, fire: n % 8 < 3 }); }, 16); })()", 5000);
await run('pause', "fz._main.setPaused(true)");
await run('unpause', "fz._main.setPaused(false)", 600);
await run('special bubbles + chain', "(() => { const D = fz.Game.debug, S = D._S(); for (let i = 0; i < 12; i++) D.spawn(['thunder', 'fire', 'water'][i % 3], 30 + (i % 6) * 30, 50 + Math.floor(i / 6) * 40); for (let k = 0; k < 6; k++) { D.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } D.give(0, 'bomb'); })()", 4000);
await run('powerups+items', "(() => { const D = fz.Game.debug; for (const k of ['pu_range','pu_rate','pu_speed','pu_flippers','pu_clock','pu_bomb','pu_heart','pu_parasol','food_0','food_5','moonpearl']) D.spawn(k, 40 + Math.random() * 160, 100); })()", 1500);
await run('hurry', "fz.Game.debug.setHurryTimer(1)", 2500);
await run('boss R10', "fz.start(1, 10, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true)", 3000);
await run('R16 stage2', "fz.start(1, 16, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true)", 2000);
await run('R30 kraken', "fz.start(1, 30, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true)", 3000);
await run('ending', "fz.goto('ending', { players: 1, scores: [100000, 0] })", 3500);
await run('entry', "fz.goto('entry', { entries: [{ pi: 0, score: 12345, round: 5 }], players: 1 })", 1500);
await run('gameover', "fz.start(1, 3, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(false); fz.Game.debug.setPlayer(0, { lives: 0 })", 1500);
const rows = await t.page.evaluate(() => [...window.__sig.seen.entries()].map(([sig, v]) => ({ sig, ...v })));
rows.sort((a, b) => a.at - b.at);
console.log(rows.length, 'distinct signatures');
const byScene = {};
for (const r of rows) (byScene[r.first] = byScene[r.first] || []).push(r.sig + ' (x' + r.n + ')');
for (const [s, l] of Object.entries(byScene)) console.log(`\n[first used in: ${s}] ${l.length} new\n  ` + l.join('\n  '));
fs.writeFileSync(OUT + '/pipelines.json', JSON.stringify(rows, null, 1));
await t.close();
