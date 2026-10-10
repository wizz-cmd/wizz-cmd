// QA balance lens (a): AIR FLOW with the real game. For each round, for ~25 standing spots spread over all
// platforms the real physics can reach, fire a real bubble left and right (empty level, god, player cannot pop),
// follow it for 700 frames and compute:
//   - settle position (mean over frames 360..540), wobble range, overlap with solid tiles, ceiling-hugging
//   - earliest frame t* at which a player who started at the shooting spot could physically touch the bubble
//     (Dijkstra over real-physics macro moves from that spot, see qa_balance_reach.mjs) -> "poppable"
//   - whether t* <= trapTime of that round (trapped enemy would still be inside)
// usage: node test/qa_balance_air.mjs --levels 1,2|all
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { loadReach, surfaceRuns, LEVELS, OUT, pad2 } from './qa_balance_lib.mjs';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const levels = arg('--levels', '1') === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : arg('--levels', '1').split(',').map(Number);

export function airSim(level, samples) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, 7);
  D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
  const S = D._S(); const p = S.players[0];
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  const W = 256, H = 248, YO = 16, QX = 4;
  function reachFrom(sx, sy, face, maxSteps) {
    const tmin = new Uint16Array(W * H).fill(65535);
    const nodes = new Map(); const heap = [];
    const hpush = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[j], heap[i]] = [heap[i], heap[j]]; i = j; } };
    const hpop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const key = (x, y) => Math.round(x / QX) + ',' + Math.round(y);
    const addNode = (x, y, cost) => { const k = key(x, y); const n = nodes.get(k); if (!n) { nodes.set(k, { x, y, cost, done: false }); hpush([cost, k]); } else if (cost < n.cost - 1.5) { n.x = x; n.y = y; n.cost = cost; n.done = false; hpush([cost, k]); } };
    const mark = (x, y, t) => { const px = Math.round(x), py = Math.round(y) + YO; if (px < 0 || px >= W || py < 0 || py >= H) return; const i = py * W + px; if (t < tmin[i]) tmin[i] = Math.min(65534, Math.round(t)); };
    function place(x, y, f) {
      S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.fx.length = 0; S.popups.length = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
      D.setPlayer(0, { x, y, vx: 0, vy: 0, onGround: true, state: 'normal', stunT: 0, face: f, inv: 0, jumpBuf: 0, noPopT: 0, cooldown: 0, power: { shoes: false, pink: false, blue: false, gold: false } });
    }
    function macro(x, y, cost, dir, jump, hold) {
      place(x, y, dir || 1);
      let airborne = false, stuck = 0, lastX = p.x;
      for (let f = 1; f < 260; f++) {
        const h = dir !== 0 && (hold < 0 || f <= hold);
        G.update([{ left: h && dir < 0, right: h && dir > 0, jump: f === 1 && jump, fire: false, jumpPressed: f === 1 && jump, firePressed: false }, NO]);
        mark(p.x, p.y, cost + f);
        if (!p.onGround) airborne = true; else { addNode(p.x, p.y, cost + f); if (airborne) return; }
        if (Math.abs(p.x - lastX) < 0.001 && !jump && p.onGround) { if (++stuck > 4) return; } else stuck = 0;
        lastX = p.x;
        if (!jump && !h && p.onGround && f > 2) return;
      }
    }
    mark(sx, sy, 0); addNode(sx, sy, 0);
    const holds = [0, 5, 10, 15, 20, 25, 30, 38, -1]; let steps = 0;
    while (heap.length && steps < (maxSteps || 9000)) {
      const [c, k] = hpop(); const n = nodes.get(k);
      if (n.done || c > n.cost + 0.01) continue;
      n.done = true; steps++;
      for (const dir of [-1, 1]) macro(n.x, n.y, n.cost, dir, false, -1);
      for (const dir of [-1, 0, 1]) for (const h of holds) { if (dir === 0 && h !== 0) continue; macro(n.x, n.y, n.cost, dir, true, h); }
    }
    return tmin;
  }
  const tBox = (tmin, x0, x1, y0, y1) => { let best = 65535; x0 = Math.max(0, Math.ceil(x0)); x1 = Math.min(255, Math.floor(x1)); y0 = Math.max(-16, Math.ceil(y0)); y1 = Math.min(231, Math.floor(y1)); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = tmin[(y + YO) * 256 + x]; if (v < best) best = v; } return best; };
  const solidAt = (c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && S.solid[r * 32 + c] === 1);
  function solidOverlap(bx, by) { // fraction of the 16x16 bubble box covered by solid tiles
    let a = 0;
    for (let r = Math.floor((by - 16) / 8); r <= Math.floor((by + 15.99 - 16) / 8); r++) for (let c = Math.floor(bx / 8); c <= Math.floor((bx + 15.99) / 8); c++) {
      if (!solidAt(c, r)) continue;
      const ox = Math.min(bx + 16, c * 8 + 8) - Math.max(bx, c * 8), oy = Math.min(by + 16, 16 + r * 8 + 8) - Math.max(by, 16 + r * 8);
      if (ox > 0 && oy > 0) a += ox * oy;
    }
    return a / 256;
  }
  const out = [];
  for (const s of samples) {
    const tmin = reachFrom(s.x, s.y, 1);
    for (const dir of [-1, 1]) {
      S.bubbles.length = 0;
      D.setPlayer(0, { x: s.x, y: s.y, vx: 0, vy: 0, onGround: true, state: 'normal', stunT: 0, face: dir, inv: 1e9, jumpBuf: 0, noPopT: 1e9, cooldown: 0 });
      S.hurryT = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9;
      G.update([{ ...NO, firePressed: true, fire: true }, NO]);
      const b = S.bubbles[S.bubbles.length - 1];
      if (!b) { out.push({ s, dir, err: 'no bubble' }); continue; }
      b.life = 1e9; // do not let it expire during the measurement
      let tPop = null, popPos = null, firstFloat = null; const traj = [];
      for (let t = 1; t <= 760; t++) {
        // keep the shooter parked (so it never touches the bubble) -- the player is only a probe through tmin
        D.setPlayer(0, { x: s.x, y: s.y, vx: 0, vy: 0, onGround: true, face: dir, inv: 1e9, noPopT: 1e9 });
        G.update([NO, NO]);
        if (b.dead) break;
        if (firstFloat === null && b.state === 'float') firstFloat = t;
        traj.push([b.x, b.y]);
        if (tPop === null && b.state === 'float' && t >= (firstFloat || 0) + 8) { const v = tBox(tmin, b.x - 11, b.x + 11, b.y - 13, b.y + 11); if (v <= t + 1 && v < 65535) { tPop = Math.max(v, 1); popPos = [b.x, b.y]; } }
      }
      const w = traj.slice(639, 760);
      const mx = w.reduce((a, q) => a + q[0], 0) / w.length, my = w.reduce((a, q) => a + q[1], 0) / w.length;
      const rngx = Math.max(...w.map((q) => q[0])) - Math.min(...w.map((q) => q[0]));
      const rngy = Math.max(...w.map((q) => q[1])) - Math.min(...w.map((q) => q[1]));
      // direction reversals of x during the last 180 frames (jitter)
      let rev = 0, pdx = 0; for (let i = 1; i < w.length; i++) { const dx = w[i][0] - w[i - 1][0]; if (Math.abs(dx) > 1e-6) { if (pdx && Math.sign(dx) !== Math.sign(pdx)) rev++; pdx = dx; } }
      const last = traj[traj.length - 1] || [0, 0];
      let tArrive = null; for (let i = 0; i < traj.length; i++) { if (Math.hypot(traj[i][0] - mx, traj[i][1] - my) < 4) { tArrive = i + 1; break; } }
      const tSettle = tBox(tmin, mx - 11, mx + 11, my - 13, my + 11);
      // can a player pop it at the settle spot from this start at all, and from a standing position?
      out.push({ sx: s.x, sy: s.y, dir, firstFloat, tPop, popPos, settle: [Math.round(mx * 10) / 10, Math.round(my * 10) / 10], rngx: Math.round(rngx * 10) / 10, rngy: Math.round(rngy * 10) / 10,
        overlap: Math.round(solidOverlap(mx, my) * 100) / 100, tArrive, ceil: my <= 24.5, rev, tSettle: tSettle === 65535 ? null : tSettle, last });
    }
  }
  S.bubbles.length = 0;
  return out;
}

function pickSamples(lv) {
  const def = LEVELS[lv - 1]; const R = loadReach(lv, 1);
  const runs = surfaceRuns(def);
  const picks = [];
  for (const run of runs) {
    const ns = R.nodes.filter((n) => Math.abs(n[1] - run.r * 8) < 0.5 && n[0] + 14 > run.c0 * 8 && n[0] + 2 < (run.c1 + 1) * 8 && n[0] >= 16 && n[0] <= 224);
    if (!ns.length) continue;
    ns.sort((a, b) => a[0] - b[0]);
    picks.push({ x: ns[Math.floor(ns.length / 2)][0], y: ns[0][1], r: run.r, w: run.c1 - run.c0 + 1 });
    if (ns.length > 6) { picks.push({ x: ns[0][0], y: ns[0][1], r: run.r, w: run.c1 - run.c0 + 1 }); picks.push({ x: ns[ns.length - 1][0], y: ns[0][1], r: run.r, w: run.c1 - run.c0 + 1 }); }
  }
  // thin out to <= 26 samples, evenly over the list sorted by row
  picks.sort((a, b) => a.y - b.y || a.x - b.x);
  if (picks.length <= 26) return picks;
  const step = picks.length / 26; const outp = []; for (let i = 0; i < 26; i++) outp.push(picks[Math.floor(i * step)]);
  return outp;
}

const t = await launch(process.env.FP_HTML ? { html: process.env.FP_HTML } : {}); const g = fp(t.page); await g.freeze(true);
for (const lv of levels) {
  const t0 = Date.now();
  const samples = pickSamples(lv);
  const r = await t.page.evaluate(`(${airSim.toString()})(${lv}, ${JSON.stringify(samples)})`);
  fs.writeFileSync(path.join(OUT, `air${process.env.FP_TAG || ''}_${pad2(lv)}.json`), JSON.stringify({ level: lv, samples, results: r }));
  const pop = r.filter((x) => x.tPop !== null && x.tPop !== undefined).length;
  console.log(`round ${lv}: ${r.length} shots, poppable ${pop}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(t.errors.length ? 'ERRORS ' + t.errors.join(' | ') : 'no page errors');
await t.close();
