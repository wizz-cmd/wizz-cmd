// QA balance lens: physics reachability + travel-time (Dijkstra in frames) over the REAL Game physics.
// For each round: start the real game (dist/fizzpop.html), strip the enemies, then explore player macro-moves
// (walk, jump with several horizontal hold patterns) by calling Game.update itself.
// Output per round/pad: out/qa/balance/reach_<pad>_<NN>.json  { nodes:[[x,y,cost]], tmin: base64 Uint16 grid }
//   tmin[(py+16)*256 + px] = min frames from the pad at which the player's sprite origin (px,py) can be there
//   (65535 = never). Grid covers px 0..255, py -16..231.
// usage: node test/qa_balance_reach.mjs --levels 1,2,3|all [--pad 1|2]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const levels = arg('--levels', '1') === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : arg('--levels', '1').split(',').map(Number);
const pad = +arg('--pad', 1);
const OUT = path.join(PROJECT, 'out', 'qa', 'balance');

export function reachSim(level, sx, sface) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, 7);
  D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
  const S = D._S(); const p = S.players[0];
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  const QX = 4;
  const W = 256, H = 248, YO = 16;
  const tmin = new Uint16Array(W * H).fill(65535);
  const nodes = new Map();
  const heap = [];
  const hpush = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[j], heap[i]] = [heap[i], heap[j]]; i = j; } };
  const hpop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const key = (x, y) => Math.round(x / QX) + ',' + Math.round(y);
  const addNode = (x, y, cost) => {
    const k = key(x, y); const n = nodes.get(k);
    if (!n) { const nn = { x, y, cost, done: false }; nodes.set(k, nn); hpush([cost, k]); }
    else if (cost < n.cost - 1.5) { n.x = x; n.y = y; n.cost = cost; n.done = false; hpush([cost, k]); }
  };
  const mark = (x, y, t) => {
    const px = Math.round(x), py = Math.round(y) + YO;
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    const i = py * W + px; if (t < tmin[i]) tmin[i] = Math.min(65534, Math.round(t));
  };
  function place(x, y, face) {
    S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.fx.length = 0; S.popups.length = 0;
    S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
    D.setPlayer(0, { x, y, vx: 0, vy: 0, onGround: true, state: 'normal', stunT: 0, face, inv: 0, jumpBuf: 0, noPopT: 0, cooldown: 0,
      power: { shoes: false, pink: false, blue: false, gold: false } });
  }
  function macro(x, y, cost, dir, jump, hold) {
    place(x, y, dir || 1);
    let airborne = false, stuck = 0, lastX = p.x;
    for (let f = 1; f < 260; f++) {
      const h = dir !== 0 && (hold < 0 || f <= hold);
      const inp = { left: h && dir < 0, right: h && dir > 0, jump: f === 1 && jump, fire: false, jumpPressed: f === 1 && jump, firePressed: false };
      G.update([inp, NO]);
      mark(p.x, p.y, cost + f);
      if (!p.onGround) airborne = true;
      else { addNode(p.x, p.y, cost + f); if (airborne) return; }
      if (Math.abs(p.x - lastX) < 0.001 && !jump && p.onGround) { if (++stuck > 4) return; } else stuck = 0;
      lastX = p.x;
      if (!jump && !h && p.onGround && f > 2) return;
    }
  }
  mark(sx, 200, 0);
  addNode(sx, 200, 0);
  const holds = [0, 5, 10, 15, 20, 25, 30, 38, -1];
  let steps = 0;
  while (heap.length && steps < 9000) {
    const [c, k] = hpop(); const n = nodes.get(k);
    if (n.done || c > n.cost + 0.01) continue;
    n.done = true; steps++;
    for (const dir of [-1, 1]) macro(n.x, n.y, n.cost, dir, false, -1);
    for (const dir of [-1, 0, 1]) for (const h of holds) { if (dir === 0 && h !== 0) continue; macro(n.x, n.y, n.cost, dir, true, h); }
  }
  // encode
  const bytes = new Uint8Array(tmin.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { steps, nodes: [...nodes.values()].map((n) => [Math.round(n.x * 100) / 100, Math.round(n.y * 100) / 100, n.cost]), tmin: btoa(bin) };
}

const t = await launch();
const g = fp(t.page);
await g.freeze(true);
for (const lv of levels) {
  const t0 = Date.now();
  const r = await t.page.evaluate(`(${reachSim.toString()})(${lv}, ${pad === 1 ? 24 : 216}, ${pad === 1 ? 1 : -1})`.replace('(function', '(function'), );
  fs.writeFileSync(path.join(OUT, `reach_p${pad}_${String(lv).padStart(2, '0')}.json`), JSON.stringify(r));
  console.log(`round ${lv} pad ${pad}: ${r.nodes.length} nodes, ${r.steps} expansions, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(t.errors.length ? 'ERRORS ' + t.errors.join(' | ') : 'no page errors');
await t.close();
