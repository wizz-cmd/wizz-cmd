// QA balance lens: per-round reachability report from out/qa/balance/reach_*.json
import { LEVELS, loadReach, surfaceRuns, runCost, pad2 } from './qa_balance_lib.mjs';
const rows = [];
for (let lv = 1; lv <= 30; lv++) {
  const def = LEVELS[lv - 1];
  const runs = surfaceRuns(def);
  for (const pad of [1, 2]) {
    const R = loadReach(lv, pad);
    const unreached = runs.filter((rn) => runCost(R, rn) === 65535);
    const maxCost = Math.max(...R.nodes.map((n) => n[2]));
    const enemies = def.enemies.map((e) => {
      const walker = ['nibbler', 'crabbit', 'springle'].includes(e.t);
      if (!walker) return null;
      const run = runs.find((rn) => rn.r === e.r + 2 && ((e.c >= rn.c0 && e.c <= rn.c1) || (e.c + 1 >= rn.c0 && e.c + 1 <= rn.c1)));
      return run ? { t: e.t, c: e.c, r: e.r, cost: runCost(R, run) } : { t: e.t, c: e.c, r: e.r, cost: -1 };
    }).filter(Boolean);
    const worst = enemies.reduce((a, b) => (b.cost > a.cost ? b : a), { cost: 0 });
    console.log(`R${pad2(lv)} P${pad} surfaces ${runs.length} unreached ${unreached.length} ${unreached.map((u) => `r${u.r}c${u.c0}-${u.c1}`).join(' ')} | maxcost ${(maxCost / 60).toFixed(1)}s | walkers: ` +
      enemies.map((e) => `${e.t[0]}@r${e.r}:${e.cost === 65535 ? 'UNREACH' : e.cost < 0 ? 'nosurf' : (e.cost / 60).toFixed(1) + 's'}`).join(' '));
  }
}
