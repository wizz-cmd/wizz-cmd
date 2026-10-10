// QA balance lens (e): boss-fight bot (needs window.QB). Plays R30 through the real Game.update (god ON, so we also count what would have killed).
// Strategy of a competent player: stand under a cluster of thunder bubbles, face the side the boss is on, and jump into the cluster at the moment
// when the predicted bolts (one per bubble of the chain, flying along the facing direction at the bubble's height) overlap the boss.
// opts: players (1|2), minCluster (wait until the cluster has at least this many bubbles), minHit (min predicted hits / size), seed, maxFrames
QB.runBoss = (seed, o) => {
  o = Object.assign({ players: 1, minCluster: 4, minHitFrac: 0.6, maxFrames: 60 * 400, patience: 500, debug: 0 }, o || {});
  const { G, D, NO, MACROS, runMacro, macroIn, buildGraph, potentials, potAt, overlapR } = QB;
  fz.start(o.players, 30, seed); D.god(true);
  const S = D._S(), p = S.players[0];
  QB.setSolid(S.solid);
  buildGraph([[24, 200], [216, 200]]);
  const nodesArr = [...QB.GR.nodes.values()];
  const visits = new Map();
  let mac = null, macF = 0, lastDecision = -99, playStart = null;
  let ready = null;
  const stat = { pops: 0, boltsFired: 0, boltsHit: 0, hitsPredicted: 0, popsWithZero: 0, expired: 0, contactsBoss: 0, contactsInk: 0, volleys: [] };
  let prevCB = false, prevCI = false;
  const bossOf = () => S.enemies.find((e) => e.t === 'kraken' && !e.dead);
  function predictBoss(b, n) {                               // positions of the boss rect for frames 1..n (mirror of updateBoss, no hp change)
    const frac = b.hp / S.bossMax, spd = 0.8 + (1.4 - 0.8) * (1 - frac);
    let x = b.x, y = b.y, jx = b.jx, jy = b.jy; const out = [];
    for (let i = 0; i < n; i++) {
      x += jx * spd; y += jy * spd;
      if (x < 16) { x = 16; jx = 1; } else if (x > 192) { x = 192; jx = -1; }
      if (y < 24) { y = 24; jy = 1; } else if (y > 168) { y = 168; jy = -1; }
      out.push([x + 6, y + 6, 36, 36]);
    }
    return out;
  }
  function clusters() {
    const bs = S.bubbles.filter((b) => !b.dead && b.kind === 'thunder' && b.state === 'float' && !b.popAt);
    const seen = new Set(), cs = [];
    for (const b of bs) {
      if (seen.has(b)) continue; const c = [b]; seen.add(b);
      for (let k = 0; k < c.length; k++) for (const q of bs) if (!seen.has(q) && Math.hypot(q.x - c[k].x, q.y - c[k].y) <= 18) { seen.add(q); c.push(q); }
      cs.push(c);
    }
    return cs;
  }
  /** predicted number of boss hits when the chain starting at bubble `first` (of cluster c) pops at delay t0 frames from now, facing dir */
  function volley(c, first, t0, dir, boss) {
    const lvl = new Map([[first, 0]]); const q = [first];
    for (let k = 0; k < q.length; k++) for (const b of c) if (!lvl.has(b) && Math.hypot(b.x - q[k].x, b.y - q[k].y) <= 18) { lvl.set(b, lvl.get(q[k]) + 1); q.push(b); }
    const H = 90; const bp = predictBoss(boss, t0 + 4 * 8 + H);
    let hits = 0;
    for (const [b, L] of lvl) {
      const ti = t0 + 4 * L;                                   // frame offset at which this bubble pops
      let bx = b.x; const by = b.y + 4;
      for (let k = 1; k <= H; k++) {
        bx += dir * 4;
        if (dir > 0 ? bx + 16 >= 240 : bx <= 16) break;
        const r = bp[Math.min(bp.length - 1, ti + k - 1)];
        if (overlapR([bx, by, 16, 8], r)) { hits++; break; }
      }
    }
    return { hits, size: lvl.size };
  }
  function decideMove(pot) {
    const here = { x: p.x, y: p.y, vy: 0, g: true, jb: 0 };
    const c0 = potAt(pot, p.x, p.y);
    if (c0 === 0) return null;
    let best = null, bc = Infinity;
    for (let mi = 0; mi < MACROS.length - 1; mi++) {
      const m = MACROS[mi]; const r = runMacro(here, m, false);
      if (!r.st.g || (Math.abs(r.st.x - p.x) < 0.5 && Math.abs(r.st.y - p.y) < 0.5)) continue;
      const pv = potAt(pot, r.st.x, r.st.y); if (pv === Infinity) continue;
      const vk = Math.round(r.st.x / 2) * 1000 + Math.round(r.st.y);
      const cost = r.frames + pv + 25 * (visits.get(vk) || 0);
      if (cost < bc - 0.25 || (Math.abs(cost - bc) <= 0.25 && best && r.frames > best.frames)) { bc = cost; best = { m, frames: r.frames, vk }; }
    }
    if (best) { visits.set(best.vk, (visits.get(best.vk) || 0) + 1); return best; }
    return null;
  }
  function airMove(pot) {
    let best = null, bc = Infinity;
    for (const dir of [0, -1, 1]) {
      const st = { x: p.x, y: p.y, vy: p.vy, g: false, jb: 0 }; let f = 0;
      for (f = 1; f < 230; f++) { QB.stepP(st, dir, false); if (st.g) break; }
      if (!st.g) continue; const pv = potAt(pot, st.x, st.y); if (pv === Infinity) continue;
      if (f + pv < bc) { bc = f + pv; best = { m: { dir, jump: false, hold: -1 }, frames: f }; }
    }
    return best;
  }
  const seenBolts = new Set(), boltList = [];
  let curCluster = null, waitSince = 0, tsLast = null;
  const total = o.maxFrames + 160, dbg = [];
  let clearAt = null;
  for (let f = 0; f < total; f++) {
    const boss = bossOf();
    if (S.phase === 'play' && playStart === null) playStart = S.frame;
    if (!boss || S.bossPhase !== 'fight') { if (clearAt === null) clearAt = S.frame - (playStart || 0); break; }
    let dir = 0, jump = false, fire = false;
    if (p.state === 'normal' && !p.stunT && boss.state === 'active') {
      if (mac) { const i = macroIn(mac.m, macF + 1); dir = i.dir; jump = i.jp; macF++; if (macF >= mac.frames) mac = null; }
      else {
        // choose cluster
        const cs = clusters();
        let best = null, bs = -1;
        for (const c of cs) { const sc = c.length * 100 - Math.abs(c[0].x - p.x) * 0.1 + (curCluster && c.includes(curCluster[0]) ? 50 : 0); if (sc > bs) { bs = sc; best = c; } }
        curCluster = best;
        if (best) {
          const low = best.reduce((a, b) => (b.y > a.y ? b : a));
          const goal = []; for (const n of nodesArr) if (Math.abs(n.x - low.x) <= 10 && n.y > low.y - 14 && n.y < low.y + 54) goal.push(n.k);
          const pot = potentials(goal);
          if (p.onGround && S.frame - lastDecision >= 1) {
            lastDecision = S.frame;
            const c0 = potAt(pot, p.x, p.y);
            if (c0 === 0 || c0 < 4) {
              // at the ready spot: evaluate a jump now for both facings
              const oldest = Math.max(...best.map((b) => b.age));
              let bestJ = null;
              for (const jm of [{ dir: 0, jump: true, hold: 0 }, { dir: -1, jump: true, hold: 8 }, { dir: 1, jump: true, hold: 8 }, { dir: -1, jump: true, hold: 16 }, { dir: 1, jump: true, hold: 16 }]) {
                const r = runMacro({ x: p.x, y: p.y, vy: 0, g: true, jb: 0 }, jm, true);
                let tt = null, tb = null;
                for (let k = 0; k < r.path.length && tt === null; k++) for (const b of best) { if (overlapR([r.path[k][0] + 2, r.path[k][1] + 2, 12, 14], [b.x + 2, b.y + 2, 12, 12])) { tt = k + 1; tb = b; break; } }
                if (tt === null) continue;
                for (const fd of [-1, 1]) { const v = volley(best, tb, tt, fd, boss); if (!bestJ || v.hits > bestJ.v.hits) bestJ = { jm, v, fd, tt }; }
              }
              const want = Math.max(1, Math.ceil(o.minHitFrac * best.length));
              const sizeOK = best.length >= o.minCluster || oldest > 640;
              const waited = S.frame - waitSince;
              if (bestJ && sizeOK && (bestJ.v.hits >= want || (waited > o.patience && bestJ.v.hits >= 1) || oldest > 820)) {
                D.setPlayer(0, { face: bestJ.fd });
                mac = { m: bestJ.jm, frames: 70 }; macF = 1; const i = macroIn(mac.m, 1); dir = i.dir; jump = i.jp;
                stat.volleys.push({ f: S.frame - (playStart || 0), size: best.length, pred: bestJ.v.hits, face: bestJ.fd, bossY: Math.round(boss.y), bossHp: boss.hp });
                stat.hitsPredicted += bestJ.v.hits; waitSince = S.frame;
              }
            } else {
              const d = decideMove(pot);
              if (d) { mac = d; macF = 0; const i = macroIn(mac.m, 1); dir = i.dir; jump = i.jp; macF = 1; }
            }
          } else if (!p.onGround && S.frame - lastDecision >= 6) {
            lastDecision = S.frame; const d = airMove(pot);
            if (d) { mac = d; macF = 1; dir = macroIn(d.m, 1).dir; }
          }
        } else { waitSince = S.frame; }
      }
    }
    const hp0 = boss.hp;
    G.update([{ left: dir < 0, right: dir > 0, jump, fire, jumpPressed: jump, firePressed: fire }, NO]);
    for (const bo of S.bolts) { if (!seenBolts.has(bo)) { seenBolts.add(bo); stat.boltsFired++; boltList.push(bo); } }
    const b2 = bossOf(); if (b2 && b2.hp < hp0) stat.boltsHit += hp0 - b2.hp; else if (!b2 && hp0 > 0) stat.boltsHit += hp0;
    // contacts
    const pr2 = [p.x + 2, p.y + 2, 12, 14]; let cb = false, ci = false;
    if (b2 && b2.state === 'active' && overlapR([b2.x + 6, b2.y + 6, 36, 36], pr2)) cb = true;
    for (const q of S.proj) if (!q.dead && overlapR([q.x + 1, q.y + 1, 6, 6], pr2)) ci = true;
    if (cb && !prevCB) stat.contactsBoss++; if (ci && !prevCI) stat.contactsInk++; prevCB = cb; prevCI = ci;
    if (o.debug && f % o.debug === 0) dbg.push({ f: S.frame, hp: b2 ? b2.hp : 0, boss: b2 ? [Math.round(b2.x), Math.round(b2.y)] : null, p: [Math.round(p.x), Math.round(p.y)], th: S.bubbles.filter((b) => b.kind === 'thunder').length, cl: clusters().map((c) => c.length).join(',') });
  }
  stat.boltsHitObj = boltList.filter((b) => b.hitBoss).length;
  const boss = bossOf();
  return { seed, players: o.players, ttk: clearAt, hpLeft: boss ? boss.hp : 0, bossMax: S.bossMax, stat, hurryAt: S.hurry ? 1 : 0, ghost: !!S.ghost, dbg };
};

/** ORACLE boss fight: the player teleports into a thunder bubble the moment the predicted volley is good (ignores travel/dodging).
 *  This is the supply/alignment-limited LOWER BOUND of the time to kill. opts.rule: 'any' (pop when >=1 hit predicted), 'full' (all bolts hit), 'half' (>= half) */
QB.runBossOracle = (seed, o) => {
  o = Object.assign({ players: 1, rule: 'half', maxFrames: 60 * 600, waitMax: 400, boltH: 8 }, o || {});
  const { G, D, NO, overlapR } = QB;
  fz.start(o.players, 30, seed); D.god(true);
  const S = D._S(), p = S.players[0];
  let playStart = null, volleys = 0, bolts = 0; const seen = new Set(); const vlog = [];
  const bossOf = () => S.enemies.find((e) => e.t === 'kraken' && !e.dead);
  function predictBoss(b, n) { const frac = b.hp / S.bossMax, spd = 0.8 + 0.6 * (1 - frac); let x = b.x, y = b.y, jx = b.jx, jy = b.jy; const out = []; for (let i = 0; i < n; i++) { x += jx * spd; y += jy * spd; if (x < 16) { x = 16; jx = 1; } else if (x > 192) { x = 192; jx = -1; } if (y < 24) { y = 24; jy = 1; } else if (y > 168) { y = 168; jy = -1; } out.push([x + 6, y + 6, 36, 36]); } return out; }
  function chainOf(first, bs) { const lvl = new Map([[first, 0]]); const q = [first]; for (let k = 0; k < q.length; k++) for (const b of bs) if (!lvl.has(b) && Math.hypot(b.x - q[k].x, b.y - q[k].y) <= 18) { lvl.set(b, lvl.get(q[k]) + 1); q.push(b); } return lvl; }
  function hitsOf(lvl, dir, bp) { let hits = 0; for (const [b, L] of lvl) { let bx = b.x; const by = b.y + 4; for (let k = 1; k <= 100; k++) { bx += dir * 4; if (dir > 0 ? bx + 16 >= 240 : bx <= 16) break; const r = bp[Math.min(bp.length - 1, 1 + 4 * L + k - 1)]; if (overlapR([bx, by - (o.boltH - 8) / 2, 16, o.boltH], r)) { hits++; break; } } } return hits; }
  let clearAt = null;
  for (let f = 0; f < o.maxFrames + 160; f++) {
    const boss = bossOf();
    if (S.phase === 'play' && playStart === null) playStart = S.frame;
    if (!boss || S.bossPhase !== 'fight') { clearAt = S.frame - (playStart || 0); break; }
    if (boss.state === 'active') {
      const bs = S.bubbles.filter((b) => !b.dead && b.kind === 'thunder' && b.state === 'float' && !b.popAt);
      const bp = predictBoss(boss, 140);
      let best = null;
      for (const b of bs) {
        const lvl = chainOf(b, bs);
        for (const dir of [-1, 1]) {
          const h = hitsOf(lvl, dir, bp), sz = lvl.size;
          const ok = o.rule === 'any' ? h >= 1 : o.rule === 'full' ? h === sz && sz >= 1 : o.rule === 'c2' ? (sz >= 2 && h * 10 >= sz * 6) : o.rule === 'c3' ? (sz >= 3 && h * 10 >= sz * 6) : h * 2 >= sz && h >= 1;
          const aged = b.age > 900 - 60;                 // about to expire: use it if it hits at all
          if ((ok || (aged && h >= 1)) && (!best || h > best.h || (h === best.h && sz > best.sz))) best = { b, dir, h, sz };
        }
      }
      if (best) { D.setPlayer(0, { x: best.b.x, y: best.b.y, vx: 0, vy: 0, face: best.dir, noPopT: 0, onGround: false }); volleys++; vlog.push({ f: S.frame, h: best.h, sz: best.sz, hp0: boss.hp, b: [Math.round(best.b.x), Math.round(best.b.y)], dir: best.dir, boss: [Math.round(boss.x), Math.round(boss.y)] }); }
    }
    G.update([NO, NO]);
    for (const bo of S.bolts) if (!seen.has(bo)) { seen.add(bo); bolts++; }
    for (const v of vlog) if (v.hp1 === undefined && S.frame - v.f >= 80) { const bb = bossOf(); v.hp1 = bb ? bb.hp : 0; }
  }
  const boss = bossOf();
  return { seed, ttk: clearAt, volleys, bolts, hpLeft: boss ? boss.hp : 0, vlog: o.log ? vlog : undefined };
};
