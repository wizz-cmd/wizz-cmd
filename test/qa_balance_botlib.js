// QA balance lens: in-page library (injected as plain script text) -- window.QB
//  * a bit-exact REPLICA of the player physics of Game (copied from src/40_game.js physStep/moveX/landingY/updatePlayer)
//    used for planning only; the bot itself plays through the REAL Game.update.
//  * macro-move graph per level (nodes = grounded spots on a 2 px grid), reverse-Dijkstra potentials
//  * a clear-the-round bot (hunt enemies with bubbles, then pop the trapped bubbles) and helpers.
window.QB = (() => {
  const G = fz.Game, D = G.debug;
  const T = 8, MAP_Y = 16, COLS = 32, ROWS = 26, EPS = 1e-4;
  const GRAV = 0.16, TERM = 2.0, JUMPV = -3.75, BX = 2, BW = 12, BY = 2, BH = 14, PLAY_TOP = 24, SCREEN_H = 224, WALK = 1.25;
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  let SOL = null;
  const isSolid = (c, r) => (c < 0 || c >= COLS ? true : r < 0 || r >= ROWS ? false : SOL[r * COLS + c] === 1);
  const isLandable = (c, r) => r >= 1 && r < ROWS && isSolid(c, r) && !isSolid(c, r - 1);
  function bodyHits(x, y) {
    const c0 = Math.floor((x + BX) / T), c1 = Math.floor((x + BX + BW - EPS) / T), r0 = Math.floor((y + BY - MAP_Y) / T), r1 = Math.floor((y + BY + BH - EPS - MAP_Y) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(c, r)) return true;
    return false;
  }
  function landingY(xa, xb, f0, f1) {
    const rb = Math.ceil((f0 - MAP_Y - EPS) / T);
    if (rb < 1 || rb >= ROWS) return null;
    const top = MAP_Y + rb * T;
    if (top > f1 + EPS) return null;
    const c0 = Math.floor(xa / T), c1 = Math.floor((xb - EPS) / T);
    for (let c = c0; c <= c1; c++) if (isLandable(c, rb)) return top;
    return null;
  }
  function moveX(st, dx) {
    let nx = st.x + dx, blocked = false;
    if (nx < 16) { nx = 16; blocked = true; } else if (nx > 240 - 16) { nx = 240 - 16; blocked = true; }
    if (!bodyHits(st.x, st.y) && bodyHits(nx, st.y)) {
      if (dx > 0) { const col = Math.floor((nx + BX + BW - EPS) / T); nx = Math.max(st.x, col * T - BX - BW); }
      else { const col = Math.floor((nx + BX) / T); nx = Math.min(st.x, (col + 1) * T - BX); }
      blocked = true;
    }
    st.x = nx; return blocked;
  }
  function stepP(st, dir, jp) {
    const vx = dir * WALK;
    if (jp) st.jb = 4; else if (st.jb > 0) st.jb--;
    if (st.jb > 0 && st.g) { st.vy = JUMPV; st.g = false; st.jb = 0; }
    if (vx !== 0) moveX(st, vx);
    const vy1 = Math.min(st.vy + GRAV, TERM), dy = (st.vy + vy1) / 2, y0 = st.y;
    st.y += dy; st.vy = vy1; st.g = false;
    if (dy >= 0) { const top = landingY(st.x + BX, st.x + BX + BW, y0 + 16, st.y + 16); if (top !== null) { st.y = top - 16; st.vy = 0; st.g = true; } }
    else if (st.y < PLAY_TOP) { st.y = PLAY_TOP; st.vy = 0; }
    if (st.y > SCREEN_H) st.y -= SCREEN_H;
  }
  // ---- macros ---------------------------------------------------------------------------------
  const WALKS = [4, 8, 16, 32, -1], HOLDS = [0, 6, 12, 18, 24, 30, 36, -1];
  const MACROS = [];
  for (const dir of [-1, 1]) for (const w of WALKS) MACROS.push({ dir, jump: false, hold: w });
  for (const dir of [-1, 0, 1]) for (const h of HOLDS) { if (dir === 0 && h !== 0) continue; MACROS.push({ dir, jump: true, hold: h }); }
  MACROS.push({ dir: 0, jump: false, hold: 0 });                       // wait (1 frame handled by caller)
  /** input of macro m on frame f (1-based) */
  const macroIn = (m, f) => ({ dir: m.dir !== 0 && (m.hold < 0 || f <= m.hold) ? m.dir : 0, jp: m.jump && f === 1 });
  /** run macro on a replica state copy. Returns {st, frames, path} */
  function runMacro(st0, m, wantPath) {
    const st = { x: st0.x, y: st0.y, vy: st0.vy, g: st0.g, jb: st0.jb || 0 };
    const path = wantPath ? [] : null;
    let airborne = !st.g, lastX = st.x, stuck = 0, f = 0;
    for (f = 1; f < 230; f++) {
      const i = macroIn(m, f);
      stepP(st, i.dir, i.jp);
      if (path) path.push([st.x, st.y]);
      if (!st.g) airborne = true;
      if (st.g && (airborne && (m.jump || f > 1))) { if (airborne) break; }
      if (!m.jump) {
        if (st.g && m.hold >= 0 && f >= Math.max(1, m.hold)) break;                // timed walk finished on the ground
        if (st.g && Math.abs(st.x - lastX) < 1e-4) { if (++stuck > 3) break; } else stuck = 0;
        if (m.dir === 0) break;
      }
      lastX = st.x;
    }
    return { st, frames: f, path };
  }
  // ---- graph ------------------------------------------------------------------------------------
  let GR = null;
  const nkey = (x, y) => Math.round(x / 2) * 1000 + Math.round(y);
  function buildGraph(starts) {
    SOL = D._S().solid;
    const nodes = new Map(), queue = [];
    const add = (st) => { const k = nkey(st.x, st.y); if (!nodes.has(k)) { nodes.set(k, { k, x: st.x, y: st.y, edges: [] }); queue.push(k); } return k; };
    for (const s of starts) add({ x: s[0], y: s[1], vy: 0, g: true });
    let qi = 0;
    while (qi < queue.length && nodes.size < 4000) {
      const n = nodes.get(queue[qi++]);
      for (let mi = 0; mi < MACROS.length - 1; mi++) {
        const m = MACROS[mi];
        const r = runMacro({ x: n.x, y: n.y, vy: 0, g: true, jb: 0 }, m, false);
        if (!r.st.g) continue;
        if (Math.abs(r.st.x - n.x) < 0.5 && Math.abs(r.st.y - n.y) < 0.5) continue;
        const k2 = add(r.st);
        n.edges.push({ mi, to: k2, f: r.frames });
      }
    }
    const rev = new Map();
    for (const n of nodes.values()) for (const e of n.edges) { let a = rev.get(e.to); if (!a) rev.set(e.to, a = []); a.push({ from: n.k, f: e.f }); }
    const byRow = new Map();
    for (const n of nodes.values()) { const r = Math.round(n.y); let a = byRow.get(r); if (!a) byRow.set(r, a = []); a.push(n); }
    GR = { nodes, rev, byRow };
    return GR;
  }
  /** nearest node key for a grounded state (same row, |dx| <= 3) */
  function nodeAt(x, y) {
    const row = GR.byRow.get(Math.round(y)); if (!row) return null;
    let best = null, bd = 3.5; for (const n of row) { const d = Math.abs(n.x - x); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  /** reverse Dijkstra: potential[k] = min frames from node k to any goal node */
  function potentials(goalKeys) {
    const pot = new Map(); const heap = [];
    const push = (c, k) => { heap.push([c, k]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[j], heap[i]] = [heap[i], heap[j]]; i = j; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const k of goalKeys) { pot.set(k, 0); push(0, k); }
    while (heap.length) {
      const [c, k] = pop(); if (c > pot.get(k)) continue;
      const rv = GR.rev.get(k); if (!rv) continue;
      for (const e of rv) { const nc = c + e.f; if (!(pot.get(e.from) <= nc)) { pot.set(e.from, nc); push(nc, e.from); } }
    }
    return pot;
  }
  const potAt = (pot, x, y) => { const n = nodeAt(x, y); if (!n) return Infinity; const v = pot.get(n.k); return v === undefined ? Infinity : v; };
  const overlapR = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  return { G, D, NO, MACROS, runMacro, macroIn, stepP, buildGraph, nodeAt, potentials, potAt, overlapR, get GR() { return GR; }, setSolid(s) { SOL = s; } };
})();
