// Random-walk players on every level: physics invariants (bounds, embedding, floating, ceiling stick, ground flicker when idle)
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 2, level: 1, seed: 1 });
const SRC = (L, seed, frames) => `(() => {
  fz.start(2, ${L}, ${seed}); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  let s = ${seed} * 7919 + ${L}; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const depthOf = (x, y) => { let best = 0; const L = x + 2, R = x + 14, Tp = y + 2, B = y + 16; for (let r = Math.floor((Tp - MAP_Y) / T); r <= Math.floor((B - 1e-6 - MAP_Y) / T); r++) for (let c = Math.floor(L / T); c <= Math.floor((R - 1e-6) / T); c++) if (solid(c, r)) { const ox = Math.min(R, (c + 1) * T) - Math.max(L, c * T), oy = Math.min(B, MAP_Y + (r + 1) * T) - Math.max(Tp, MAP_Y + r * T); best = Math.max(best, Math.min(ox, oy)); } return best; };
  const track = S.players.map(() => ({ maxDepth: 0, emb: 0, worstEmb: 0, float: 0, worstFloat: 0, ceil: 0, worstCeil: 0, oob: 0, flick: 0, idleG: [], lastG: null }));
  const inp = [{}, {}]; const hold = [0, 0];
  const issues = [];
  for (let f = 0; f < ${frames}; f++) {
    for (let i = 0; i < 2; i++) {
      if (hold[i]-- <= 0) { hold[i] = 5 + Math.floor(rnd() * 40); const r = rnd(); inp[i] = { left: r < 0.35, right: r >= 0.35 && r < 0.7, jump: rnd() < 0.4, fire: rnd() < 0.3 }; if (rnd() < 0.1) inp[i] = {}; }
      fz.input.set(i, inp[i]);
    }
    fz.step(1);
    for (let i = 0; i < 2; i++) {
      const p = S.players[i], tr = track[i];
      if (p.x < 16 - 0.01 || p.x > 224 + 0.01 || p.y < -20 || p.y > 230 || Number.isNaN(p.x + p.y + p.vy)) tr.oob++;
      if (p.onGround && bodyHits(p.x, p.y)) { tr.maxDepth = Math.max(tr.maxDepth, depthOf(p.x, p.y)); tr.emb++; tr.worstEmb = Math.max(tr.worstEmb, tr.emb); } else tr.emb = 0;
      if (!p.onGround && p.vy === 0 && p.y > 24.5) { tr.float++; tr.worstFloat = Math.max(tr.worstFloat, tr.float); } else tr.float = 0;
      if (p.y <= 24.01 && p.y >= 23.99 && p.vy === 0) { tr.ceil++; tr.worstCeil = Math.max(tr.worstCeil, tr.ceil); } else tr.ceil = 0;
    }
  }
  fz.input.clear();
  // idle flicker: stand still for 120 frames and count onGround changes
  const idle = S.players.map((p) => { let ch = 0, last = p.onGround; return () => { if (p.onGround !== last) { ch++; last = p.onGround; } return ch; }; });
  for (let f = 0; f < 200; f++) { fz.step(1); idle.forEach((c) => c()); }
  const flick = idle.map((c) => c());
  return track.map((t, i) => ({ i, maxDepth: +t.maxDepth.toFixed(2), oob: t.oob, worstEmb: t.worstEmb, worstFloat: t.worstFloat, worstCeil: t.worstCeil, idleFlicker: flick[i], endG: S.players[i].onGround, endY: Math.round(S.players[i].y) }));
})()`;
const bad = [];
for (let L = 1; L <= 30; L++) for (let seed = 1; seed <= 2; seed++) {
  const r = await b.page.evaluate(SRC(L, seed, 2500));
  for (const t of r) {
    const probs = [];
    if (t.oob) probs.push('oob ' + t.oob);
    if (t.maxDepth > 4.01) probs.push('embedded depth ' + t.maxDepth); if (t.worstEmb > 30) probs.push('(embedded onGround ' + t.worstEmb + ' frames, depth ' + t.maxDepth + ')');
    if (t.worstFloat > 3) probs.push('floating ' + t.worstFloat);
    
    if (t.idleFlicker > 2) probs.push('idle ground flicker ' + t.idleFlicker);
    if (probs.length) { bad.push({ L, seed, ...t, probs }); log(`R${L} s${seed} P${t.i}: ${probs.join(', ')}`); }
  }
}
log('violations', bad.length);
const deep = bad.filter((x) => x.maxDepth > 4.01); check('PF1 standing embedded in solid never deeper than the 4 px foot-support slack', deep.length === 0, deep.slice(0, 5)); log('cases with embedded standing > 30 frames:', bad.length, 'max depth seen', Math.max(...bad.map((x) => x.maxDepth), 0));
log('errors', b.t.errors);
await b.t.close();
