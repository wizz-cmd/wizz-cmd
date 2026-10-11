// Pocket-stuck detector: longest run (frames) a walker spends inside a 28px box. All levels x 3 seeds.
import { boot, OUT } from './qa_mechanics_lib.mjs';
const HTML = process.env.QA_HTML || undefined;
const LEVELS = (process.env.QA_LEVELS || '').split(',').filter(Boolean).map(Number);
const { t, g, ev } = await boot({ level: 1, god: true, html: HTML });
const res = await ev((H, LV) => {
  const rep = [];
  for (const seed of [3, 11, 29]) for (let lvl = 1; lvl <= 29; lvl++) {
    if (LV.length && !LV.includes(lvl)) continue;
    fz.start(1, lvl, seed); fz.Game.debug.god(true); fz.Game.debug.noClear(true); fz.Game.debug.skipIntro();
    const S = H.S();
    const N = 3000;
    const anchor = S.enemies.map(e => ({ x: e.x, y: e.y, since: 0, worst: 0, worstAt: null }));
    for (let i = 0; i < N; i++) {
      S.hurryT = 0; fz.Game.update([]);     // v2: update only (fz.step also renders every frame)
      S.enemies.forEach((e, k) => {
        const a = anchor[k];
        if (e.t === 'jellop' || e.t === 'glimmer') return;
        if (Math.abs(e.x - a.x) > 28 || Math.abs(e.y - a.y) > 28) { a.x = e.x; a.y = e.y; a.since = i; }
        const run = i - a.since;
        if (run > a.worst) { a.worst = run; a.worstAt = [Math.round(a.x), Math.round(a.y)]; }
      });
    }
    S.enemies.forEach((e, k) => { if (anchor[k].worst >= 900) rep.push({ lvl, seed, t: e.t, worstRunFrames: anchor[k].worst, at: anchor[k].worstAt }); });
  }
  return rep;
}, LEVELS);
for (const r of res) console.log(JSON.stringify(r));
console.log('count', res.length, 'errors', t.errors);
await t.close();
