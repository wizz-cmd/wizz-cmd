// QA balance lens (b): SPAWN SAFETY. An idle player stands on the P1 pad / P2 pad of every round with god mode ON (enemies behave exactly
// as if it were alive up to the first hit). We record per run, in frames after the READY! intro ended (phase 'play'):
//   first overlap with an active enemy / pebble / spark / Bonefin, number of contact episodes in 60 s, and how much time any enemy
//   spends within 48 px of the pad ("camping").
// usage: node test/qa_balance_spawn.mjs --levels all [--seeds 6]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { OUT, pad2 } from './qa_balance_lib.mjs';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const levels = arg('--levels', 'all') === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : arg('--levels').split(',').map(Number);
const seeds = +arg('--seeds', 6);

export function spawnSim(level, seed, padNo, frames) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, seed);
  D.god(true);
  const S = D._S(); const p = S.players[0];
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  if (padNo === 2) D.setPlayer(0, { x: 216, y: 200, face: -1 });
  const ov = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  const first = { enemy: null, proj: null, ghost: null }; const eps = { enemy: 0, proj: 0, ghost: 0 }; const prev = { enemy: false, proj: false, ghost: false };
  let camp = 0, firstEnemyType = null, firstProjType = null, playStart = null, firstActive = null;
  const near = { }; 
  for (let f = 0; f < frames; f++) {
    G.update([NO, NO]);
    if (S.phase === 'play' && playStart === null) playStart = S.frame;
    if (playStart === null) { if (S.enemies.some((e) => e.state === 'active') && firstActive === null) firstActive = S.frame; }
    const pr = [p.x + 2, p.y + 2, 12, 14];
    let ce = false, cp = false, cg = false, cetype = null, cptype = null;
    for (const e of S.enemies) {
      if (e.dead || e.state !== 'active') continue;
      const er = e.t === 'kraken' ? [e.x + 6, e.y + 6, 36, 36] : [e.x + 2, e.y + 2, 12, 12];
      if (ov(er, pr)) { ce = true; cetype = e.t; }
    }
    for (const q of S.proj) { if (!q.dead && ov([q.x + 1, q.y + 1, 6, 6], pr)) { cp = true; cptype = q.type; } }
    if (S.ghost && ov([S.ghost.x + 3, S.ghost.y + 3, 10, 10], pr)) cg = true;
    const t = playStart === null ? -1 : S.frame - playStart;
    if (ce) { if (first.enemy === null) { first.enemy = S.frame; firstEnemyType = cetype; } if (!prev.enemy) eps.enemy++; }
    if (cp) { if (first.proj === null) { first.proj = S.frame; firstProjType = cptype; } if (!prev.proj) eps.proj++; }
    if (cg) { if (first.ghost === null) first.ghost = S.frame; if (!prev.ghost) eps.ghost++; }
    prev.enemy = ce; prev.proj = cp; prev.ghost = cg;
    if (S.enemies.some((e) => !e.dead && e.state === 'active' && Math.hypot(e.x - p.x, e.y - p.y) < 48)) camp++;
  }
  return { playStart, firstActive, first, firstEnemyType, firstProjType, eps, camp, hurryAt: S.hurryT, hurry: S.hurry };
}

const t = await launch(); const g = fp(t.page); await g.freeze(true);
const all = [];
for (const lv of levels) {
  for (const pad of [1, 2]) {
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) runs.push(await t.page.evaluate(`(${spawnSim.toString()})(${lv}, ${seed}, ${pad}, 150 + 3600)`));
    all.push({ lv, pad, runs });
  }
  console.log('round', lv, 'done');
}
fs.writeFileSync(path.join(OUT, 'spawn_' + levels[0] + '.json'), JSON.stringify(all));
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
