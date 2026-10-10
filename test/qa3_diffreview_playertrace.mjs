import { boot, log } from './qa3_diffreview_lib.mjs';
const L = +(process.argv[2] || 3), seed = +(process.argv[3] || 1), who = +(process.argv[4] || 0), mode = process.argv[5] || 'emb';
const b = await boot({ players: 2, level: 1, seed: 1 });
const r = await b.page.evaluate(([L, seed, who, mode]) => {
  fz.start(2, L, seed); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  let s = seed * 7919 + L; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const inp = [{}, {}]; const hold = [0, 0];
  const log = []; let emb = 0, found = false, ceil = 0;
  for (let f = 0; f < 2500 && !found; f++) {
    const hist = [];
    for (let i = 0; i < 2; i++) {
      if (hold[i]-- <= 0) { hold[i] = 5 + Math.floor(rnd() * 40); const r = rnd(); inp[i] = { left: r < 0.35, right: r >= 0.35 && r < 0.7, jump: rnd() < 0.4, fire: rnd() < 0.3 }; if (rnd() < 0.1) inp[i] = {}; }
      fz.input.set(i, inp[i]);
    }
    fz.step(1);
    const p = S.players[who];
    if (mode === 'emb') { if (p.onGround && bodyHits(p.x, p.y)) emb++; else emb = 0; }
    else { if (p.y <= 24.01 && p.y >= 23.99 && p.vy === 0) emb++; else emb = 0; }
    log.push(`f${f} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} vy=${p.vy.toFixed(2)} g=${p.onGround ? 1 : 0} in=${JSON.stringify(inp[who])}`);
    if (log.length > 40) log.shift();
    if (emb >= (mode === 'emb' ? 20 : 100)) { found = true; }
  }
  const p = S.players[who];
  const c0 = Math.floor(p.x / T) - 3, r0 = Math.floor((p.y - MAP_Y) / T) - 3;
  const rows = [];
  for (let rr = r0; rr < r0 + 9; rr++) { let line = String(rr).padStart(2) + ' '; for (let cc = c0; cc < c0 + 9; cc++) line += solid(cc, rr) ? '#' : '.'; rows.push(line); }
  return { found, pos: [p.x, p.y], tile: [Math.floor(p.x / T), Math.floor((p.y - MAP_Y) / T)], c0, r0, rows, log };
}, [L, seed, who, mode]);
log(JSON.stringify({ found: r.found, pos: r.pos, tile: r.tile, c0: r.c0, r0: r.r0 }));
console.log(r.rows.join('\n'));
console.log(r.log.slice(-25).join('\n'));
await b.t.close();
