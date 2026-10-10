// FIZZ & POP — test/levels_realtrap.mjs
// Player TRAP finder with the REAL game physics (the model in levels_check.mjs mirrors the wave-1 Game; the wave-2 Game added
// coyote time, a 4 px foot overlap and other tweaks). For every round the script explores the standing spots a player can reach
// from the P1 pad with walk / jump / air-steer macros executed through Game.update itself, records which spot leads to which,
// and reports the spots from which the pad can NOT be reached again (strongly-connected-component analysis).
//   node test/levels_realtrap.mjs [--html file] [--levels 29|all] [--ascii] [--from x,y]
//   --from x,y   (one round) explore from that standing spot instead and say whether the P1 pad area can be reached from there
// FIZZ_HTML env also selects the page (default dist/fizzpop.html). Exit code 1 when a trap exists.
import { launch, fp } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const html = arg('--html', process.env.FIZZ_HTML || undefined);
const lv = arg('--levels', 'all');
const levels = lv === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : lv.split(',').map(Number);
const ASCII = args.includes('--ascii');
const FROM = arg('--from', '');

function explore(level, from) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, 7);
  D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
  const S = D._S(); const p = S.players[0];
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  const QX = 4;
  const key = (x, y) => Math.round(x / QX) + ',' + Math.round(y);
  const nodes = new Map(), edges = new Map(), queue = [];
  const add = (x, y) => { const k = key(x, y); if (!nodes.has(k)) { nodes.set(k, { x, y, k }); edges.set(k, new Set()); queue.push(k); } return k; };
  function place(x, y, f) {
    S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.fx.length = 0; S.popups.length = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
    D.setPlayer(0, { x, y, vx: 0, vy: 0, onGround: true, state: 'normal', stunT: 0, face: f, inv: 1e9, jumpBuf: 0, noPopT: 0, cooldown: 0, coyote: 0, power: { shoes: false, pink: false, blue: false, gold: false } });
  }
  function macro(from, dir, jump, hold) {
    place(from.x, from.y, dir || 1);
    let airborne = false, stuck = 0, lastX = p.x;
    for (let f = 1; f < 260; f++) {
      const h = dir !== 0 && (hold < 0 || f <= hold);
      G.update([{ left: h && dir < 0, right: h && dir > 0, jump: f === 1 && jump, fire: false, jumpPressed: f === 1 && jump, firePressed: false }, NO]);
      if (!p.onGround) airborne = true;
      else { const k = add(p.x, p.y); if (k !== from.k) edges.get(from.k).add(k); if (airborne) return; }   // every standing spot on the way is a node
      if (Math.abs(p.x - lastX) < 0.001 && !jump && p.onGround) { if (++stuck > 4) return; } else stuck = 0;
      lastX = p.x;
      if (!jump && !h && p.onGround && f > 2) return;
    }
  }
  const start = from ? add(from[0], from[1]) : add(24, 200);
  const holds = [0, 5, 10, 15, 20, 25, 30, 38, -1];
  for (let qi = 0; qi < queue.length && qi < 6000; qi++) {
    const n = nodes.get(queue[qi]);
    for (const dir of [-1, 1]) macro(n, dir, false, -1);
    for (const dir of [-1, 0, 1]) for (const h of holds) { if (dir === 0 && h !== 0) continue; macro(n, dir, true, h); }
  }
  // Tarjan SCC (iterative)
  const index = new Map(), low = new Map(), on = new Set(), comp = new Map(); let idx = 0, cid = 0; const st = [];
  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work = [[root, [...edges.get(root)], 0]]; index.set(root, idx); low.set(root, idx); idx++; st.push(root); on.add(root);
    while (work.length) {
      const fr = work[work.length - 1]; const [v, nb] = fr;
      if (fr[2] < nb.length) { const u = nb[fr[2]++]; if (!index.has(u)) { index.set(u, idx); low.set(u, idx); idx++; st.push(u); on.add(u); work.push([u, [...edges.get(u)], 0]); } else if (on.has(u)) low.set(v, Math.min(low.get(v), index.get(u))); }
      else { if (low.get(v) === index.get(v)) { let u; do { u = st.pop(); on.delete(u); comp.set(u, cid); } while (u !== v); cid++; } work.pop(); if (work.length) { const pp = work[work.length - 1][0]; low.set(pp, Math.min(low.get(pp), low.get(v))); } }
    }
  }
  if (from) {   // forward reachability from the start spot
    const seen = new Set([start]), q = [start];
    for (let i = 0; i < q.length; i++) for (const u of edges.get(q[i])) if (!seen.has(u)) { seen.add(u); q.push(u); }
    const padHit = [...seen].some((k) => nodes.get(k).y >= 199 && nodes.get(k).x < 60);
    return { n: nodes.size, traps: [], p2: true, fromReach: seen.size, padHit, map: S.map };
  }
  const home = comp.get(start);
  const traps = [...nodes.values()].filter((n) => comp.get(n.k) !== home).map((n) => [Math.round(n.x), Math.round(n.y)]);
  // the P2 pad: is it a node of the home component?
  const p2 = [...nodes.values()].some((n) => n.y >= 199 && n.x > 200 && comp.get(n.k) === home);
  return { n: nodes.size, traps, p2, map: S.map };
}

const t = await launch(html ? { html } : {});
const g = fp(t.page); await g.freeze(true);
let bad = 0;
for (const L of levels) {
  const r = await t.page.evaluate(`(${explore.toString()})(${L}, ${FROM ? JSON.stringify(FROM.split(',').map(Number)) : 'null'})`);
  if (FROM) { console.log(`R${L} from ${FROM}: ${r.fromReach} spots reachable, pad area ${r.padHit ? 'REACHABLE' : 'NOT reachable'}`); bad += r.padHit ? 0 : 1; continue; }
  const flag = r.traps.length || !r.p2;
  if (flag) bad++;
  console.log(`R${L}: ${r.n} spots, ${r.traps.length} trap spot(s)${r.p2 ? '' : ', P2 pad NOT reachable both ways'}${r.traps.length ? ' ' + JSON.stringify(r.traps.slice(0, 12)) : ''}`);
  if (ASCII && r.traps.length) {
    const mk = new Set(r.traps.map(([x, y]) => `${Math.round(x / 8)},${Math.round(y / 8)}`));
    console.log(r.map.map((row, rr) => String(rr).padStart(2) + ' ' + [...row].map((ch, c) => (mk.has(`${c},${rr}`) || mk.has(`${c - 1},${rr}`) || mk.has(`${c},${rr - 1}`) ? 'T' : ch)).join('')).join('\n'));
  }
}
console.log(bad ? `${bad} round(s) with traps` : 'no player traps', t.errors.length ? 'ERRORS ' + t.errors.join(' | ') : 'no page errors');
await t.close();
process.exit(bad ? 1 : 0);
