// QA balance lens: clear-the-round bot (in-page, needs window.QB from qa_balance_botlib.js).
// The bot plays through the real Game.update with god mode ON (it ignores enemy contact, so clear times are an OPTIMISTIC lower bound
// for a human: no dodging/waiting) and records: clear time, trap/escape counts, contact episodes it would have died from.
QB.runClear = (level, seed, o) => {
  o = Object.assign({ maxFrames: 9000, pad: 1, hurryOff: false }, o || {});
  const { G, D, NO, MACROS, runMacro, macroIn, buildGraph, nodeAt, potentials, potAt, overlapR } = QB;
  fz.start(1, level, seed); D.god(true);
  const S = D._S(), p = S.players[0];
  if (o.pad === 2) D.setPlayer(0, { x: 216, y: 200, face: -1 });
  QB.setSolid(S.solid);
  const gr = buildGraph([[24, 200], [216, 200]]);
  const nodesArr = [...gr.nodes.values()];
  const trapTimeOf = (b) => b.trapTime;
  const visits = new Map();
  let mac = null, macF = 0, target = null, potCache = null, lastRefresh = -99, lastDecision = -99;
  let shots = 0, traps = 0, escapes = 0, contacts = { enemy: 0, proj: 0, ghost: 0 }, prevC = { enemy: false, proj: false, ghost: false };
  let playStart = null, hurryAt = null, ghostAt = null, clearAt = null, firstTrapAt = null, enemiesState = new Map(), lastKillAt = null;
  const trapLog = [];
  const isFlyer = (e) => e.t === 'jellop' || e.t === 'glimmer';
  const enemyGoal = (e) => {
    const ks = [];
    for (const n of nodesArr) {
      const dy = n.y - e.y, dx = Math.abs(n.x - e.x);
      if (isFlyer(e)) { if (dy >= -8 && dy <= 44 && dx >= 8 && dx <= 56) ks.push(n.k); }
      else if (Math.abs(dy) <= 4 && dx >= 20 && dx <= 46) ks.push(n.k);
    }
    if (!ks.length) for (const n of nodesArr) { const dy = n.y - e.y; if (dy >= -8 && dy <= 44 && Math.abs(n.x - e.x) <= 70) ks.push(n.k); }
    return ks;
  };
  const bubbleGoal = (b) => { const ks = []; for (const n of nodesArr) if (Math.abs(n.x - b.x) <= 10 && n.y > b.y - 14 && n.y < b.y + 54) ks.push(n.k); if (!ks.length) for (const n of nodesArr) if (Math.abs(n.x - b.x) <= 20 && n.y > b.y - 14 && n.y < b.y + 60) ks.push(n.k); return ks; };
  function chooseTarget() {
    const foes = S.enemies.filter((e) => !e.dead && (e.state === 'active' || e.state === 'frozen'));
    const bubs = S.bubbles.filter((b) => !b.dead && b.kind === 'trapped' && b.state === 'float' && !b.popAt && b.enemy && b.enemy.state === 'trapped');
    const cands = [];
    for (const b of bubs) cands.push({ type: 'bubble', ref: b, d: Math.abs(b.x - p.x) + 2 * Math.abs(b.y - p.y) });
    for (const e of foes) cands.push({ type: 'enemy', ref: e, d: Math.abs(e.x - p.x) + 2 * Math.abs(e.y - p.y) });
    cands.sort((a, b) => a.d - b.d);
    let best = null, bc = Infinity;
    for (const c of cands.slice(0, 4)) {
      const goal = c.type === 'bubble' ? bubbleGoal(c.ref) : enemyGoal(c.ref);
      const pot = potentials(goal);
      let cost = potAt(pot, p.x, p.y);
      if (c.type === 'bubble') { const rem = c.ref.trapTime - c.ref.trapT; if (rem < cost + 150) cost -= 400; else if (cost < 90) cost -= 120; else if (foes.length) cost += 120; }   // pop urgent bubbles first; otherwise hunt first
      if (target && target.ref === c.ref) cost -= 30;
      c.pot = pot; c.cost = cost;
      if (cost < bc) { bc = cost; best = c; }
    }
    return best;
  }
  function decide() {
    const t = chooseTarget(); target = t;
    if (!t) return null;
    const here = { x: p.x, y: p.y, vy: 0, g: true, jb: 0 };
    const c0 = potAt(t.pot, p.x, p.y);
    if (t.type === 'bubble' && c0 === 0) {                                  // below the bubble: jump into it
      const dir = Math.abs(t.ref.x - p.x) > 4 ? Math.sign(t.ref.x - p.x) : 0;
      return { m: { dir, jump: true, hold: dir ? 10 : 0 }, frames: 60 };
    }
    if (t.type === 'enemy' && isFlyer(t.ref) && Math.abs(t.ref.x - p.x) <= 52 && p.y - t.ref.y >= 8 && p.y - t.ref.y <= 44) return { m: { dir: 0, jump: true, hold: 0 }, frames: 50 };
    if (c0 === 0) return null;
    let best = null, bc = Infinity;
    for (let mi = 0; mi < MACROS.length - 1; mi++) {
      const m = MACROS[mi]; const r = runMacro(here, m, false);
      if (!r.st.g) continue;
      if (Math.abs(r.st.x - p.x) < 0.5 && Math.abs(r.st.y - p.y) < 0.5) continue;           // no-op
      const pv = potAt(t.pot, r.st.x, r.st.y);
      if (pv === Infinity) continue;
      const vk = Math.round(r.st.x / 2) * 1000 + Math.round(r.st.y);
      const cost = r.frames + pv + 25 * (visits.get(vk) || 0);
      if (cost < bc - 0.25 || (Math.abs(cost - bc) <= 0.25 && best && r.frames > best.frames)) { bc = cost; best = { m, frames: r.frames, vk }; }
    }
    if (best) { visits.set(best.vk, (visits.get(best.vk) || 0) + 1); return best; }
    const dir = Math.sign((t.ref.x) - p.x) || 1; return { m: { dir, jump: false, hold: 8 }, frames: 8 };   // no usable path: walk toward the target
  }
  function airDecide() {
    if (!target) target = chooseTarget();
    const t = target; if (!t) return null;
    let best = null, bc = Infinity;
    for (const dir of [0, -1, 1]) {
      const st = { x: p.x, y: p.y, vy: p.vy, g: false, jb: 0 };
      let f = 0;
      for (f = 1; f < 230; f++) { QB.stepP(st, dir, false); if (st.g) break; }
      if (!st.g) continue;
      const pv = potAt(t.pot, st.x, st.y); if (pv === Infinity) continue;
      const cost = f + pv; if (cost < bc) { bc = cost; best = { m: { dir, jump: false, hold: -1 }, frames: f }; }
    }
    return best;
  }
  const dbg = [];
  const total = o.maxFrames + 160;
  for (let f = 0; f < total; f++) {
    if (S.phase === 'clear' || S.phase === 'transition' || S.phase === 'extend') { if (clearAt === null) clearAt = S.frame - (playStart === null ? 0 : playStart); break; }
    if (S.phase === 'play' && playStart === null) playStart = S.frame;
    if (S.hurry && hurryAt === null) hurryAt = S.frame - playStart;
    if (S.ghost && ghostAt === null) ghostAt = S.frame - playStart;
    if (o.debug && f % o.debug === 0) dbg.push({ f: S.frame, p: [Math.round(p.x), Math.round(p.y), p.onGround], tg: target ? [target.type, target.ref.t || target.ref.kind, Math.round(target.ref.x), Math.round(target.ref.y), Math.round(target.cost)] : null, mac: mac ? mac.m : null, st: S.enemies.map((e) => e.t[0] + e.state[0] + Math.round(e.x) + ',' + Math.round(e.y)).join(' '), bub: S.bubbles.filter((b) => b.kind === 'trapped').map((b) => Math.round(b.x) + ',' + Math.round(b.y) + ':' + b.trapT).join(' ') });
    // ---- inputs ----
    let dir = 0, jump = false, fire = false;
    if (p.state === 'normal' && !p.stunT) {
      if (mac) { const i = macroIn(mac.m, macF + 1); dir = i.dir; jump = i.jp; macF++; if (macF >= mac.frames) { mac = null; } }
      else if (!p.onGround && S.frame - lastDecision >= 6) {
        lastDecision = S.frame; const d = airDecide();
        if (d) { mac = d; macF = 0; const i = macroIn(mac.m, 1); dir = i.dir; jump = false; macF = 1; }
      }
      else if (p.onGround && S.frame - lastDecision >= 1) {
        lastDecision = S.frame;
        const d = decide();
        if (d) { mac = d; macF = 0; const i = macroIn(mac.m, 1); dir = i.dir; jump = i.jp; macF = 1; }
      }
      // fire when an enemy is on my row, within range
      if (p.cooldown === 0) {
        let bestE = null, bd = 1e9;
        for (const e of S.enemies) {
          if (e.dead || (e.state !== 'active' && e.state !== 'frozen')) continue;
          const dy = (e.y + 8) - (p.y + 8); if (Math.abs(dy) > 9) continue;
          const dx = e.x - p.x; if (Math.abs(dx) < 4 || Math.abs(dx) > 52) continue;
          if (Math.abs(dx) < bd) { bd = Math.abs(dx); bestE = e; }
        }
        if (bestE) { fire = true; const side = Math.sign(bestE.x - p.x); if (p.face !== side) dir = side; }
      }
    }
    G.update([{ left: dir < 0, right: dir > 0, jump, fire, jumpPressed: jump, firePressed: fire }, NO]);
    if (fire && p.cooldown > 0) shots++;
    // ---- bookkeeping ----
    for (const e of S.enemies) {
      const pr = enemiesState.get(e);
      if (pr !== e.state) {
        if (e.state === 'trapped') {
          traps++; if (firstTrapAt === null) firstTrapAt = S.frame - (playStart || 0);
          // best-case time for a player standing where the shooter stands to reach the (rising) bubble
          const b = e.bubble; let T = 0;
          if (b && p.onGround) { for (let it = 0; it < 3; it++) { const bb = { x: b.x, y: Math.max(24, b.y - 0.5 * T) }; const pt = potentials(bubbleGoal(bb)); T = potAt(pt, p.x, p.y); if (T === Infinity) break; } }
          else T = null;
          trapLog.push({ t: S.frame - (playStart || 0), type: e.t, at: [Math.round(e.x), Math.round(e.y)], player: [Math.round(p.x), Math.round(p.y), p.onGround], minReach: T === null ? null : T === Infinity ? 'inf' : T, trapTime: b ? b.trapTime : 0, out: null });
          e._tl = trapLog[trapLog.length - 1];
        }
        if (pr === 'trapped' && e.state === 'active') { escapes++; if (e._tl) e._tl.out = 'escaped'; }
        if (pr === 'trapped' && e.state === 'dying') { if (e._tl) e._tl.out = 'popped@' + (S.frame - (playStart || 0) - e._tl.t); }
        enemiesState.set(e, e.state);
      }
    }
    const pr2 = [p.x + 2, p.y + 2, 12, 14];
    let ce = false, cp = false, cg = false;
    for (const e of S.enemies) if (!e.dead && e.state === 'active' && overlapR([e.x + 2, e.y + 2, 12, 12], pr2)) ce = true;
    for (const q of S.proj) if (!q.dead && overlapR([q.x + 1, q.y + 1, 6, 6], pr2)) cp = true;
    if (S.ghost && overlapR([S.ghost.x + 3, S.ghost.y + 3, 10, 10], pr2)) cg = true;
    if (ce && !prevC.enemy) contacts.enemy++; if (cp && !prevC.proj) contacts.proj++; if (cg && !prevC.ghost) contacts.ghost++;
    prevC = { enemy: ce, proj: cp, ghost: cg };
  }
  return { trapLog, dbg, level, seed, enemies: S.enemies.length, clearAt, playStart, hurryAt, ghostAt, firstTrapAt, shots, traps, escapes, contacts, phase: S.phase, frame: S.frame, left: S.enemies.filter((e) => !e.dead).length };
};
