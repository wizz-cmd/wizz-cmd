// QA balance lens (c): FLYERS. Record the real trajectories of Jellops / Glimmers (idle god player at P1 pad), calm and angry
// (hurry forced), then check against the reach data whether a player could ever shoot them:
//   catchable(ex,ey,t) <=> some player-origin P with |px-ex| < 71 (shot range 48 + body/bubble widths), |py-ey| < 13 and tmin(P) <= t
// usage: node test/qa_balance_flyers.mjs
import { launch, fp } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, loadReach, tBox, pad2 } from './qa_balance_lib.mjs';
export function flySim(level, seed, angry, frames) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, seed); D.god(true);
  const S = D._S();
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  for (let i = 0; i < 160; i++) G.update([NO, NO]);                 // through the intro
  if (angry) { D.setHurryTimer(40 * 60 * 10); for (const e of S.enemies) e.angry = true; }
  const fl = S.enemies.filter((e) => e.t === 'jellop' || e.t === 'glimmer');
  const tr = fl.map((e) => ({ t: e.t, x: [], y: [] }));
  for (let f = 0; f < frames; f++) {
    G.update([NO, NO]);
    fl.forEach((e, i) => { if (e.state === 'active') { tr[i].x.push(Math.round(e.x * 10) / 10); tr[i].y.push(Math.round(e.y * 10) / 10); } else { tr[i].x.push(null); tr[i].y.push(null); } });
  }
  return tr;
}
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const rows = [];
for (let lv = 1; lv <= 29; lv++) {
  if (!LEVELS[lv - 1].enemies.some((e) => e.t === 'jellop' || e.t === 'glimmer')) continue;
  const R = loadReach(lv, 1);
  for (const angry of [false, true]) {
    const trs = [];
    for (const seed of [1, 2, 3]) trs.push(...(await t.page.evaluate(`(${flySim.toString()})(${lv}, ${seed}, ${angry}, 1800)`)));
    for (const tr of trs) {
      let n = 0, cov = 0, covT = 0, first = null, minRegion = 65535;
      for (let f = 0; f < tr.x.length; f++) {
        if (tr.x[f] === null) continue; n++;
        const ex = tr.x[f], ey = tr.y[f];
        const v = tBox(R, ex - 70, ex + 70, ey - 12, ey + 12);
        if (v < 65535) cov++;
        if (v <= f + 160) { covT++; if (first === null) first = f; }
        minRegion = Math.min(minRegion, v);
      }
      rows.push({ lv, type: tr.t, angry, frames: n, covAny: cov / Math.max(1, n), covTimed: covT / Math.max(1, n), firstCatchable: first });
    }
  }
}
fs.writeFileSync(path.join(OUT, 'flyers.json'), JSON.stringify(rows));
// aggregate per level/type/angry
const agg = new Map();
for (const r of rows) { const k = `${r.lv}|${r.type}|${r.angry}`; const a = agg.get(k) || { n: 0, cov: 0, covT: 0, first: [] }; a.n++; a.cov += r.covAny; a.covT += r.covTimed; if (r.firstCatchable !== null) a.first.push(r.firstCatchable); agg.set(k, a); }
console.log('rnd type     angry | catchable-time share (reachable region, any time) | share when player starts from pad (timed) | worst first-catchable frame');
for (const [k, a] of agg) { const [lv, ty, an] = k.split('|'); console.log(lv.padStart(2), ty.padEnd(8), an.padEnd(5), '|', (100 * a.cov / a.n).toFixed(0).padStart(4) + '%', '|', (100 * a.covT / a.n).toFixed(0).padStart(4) + '%', '|', a.first.length ? Math.max(...a.first) : 'never'); }
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
