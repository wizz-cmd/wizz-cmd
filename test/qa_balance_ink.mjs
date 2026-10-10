// QA balance lens (e): INK DODGE-ABILITY. Monte-Carlo over (boss position/direction, player standing spot of round 30). The boss fires its 5-way
// ink fan (mirror of fireInk: base angle to the player's centre, +-0.3/0.6 rad, speed 1.4); the player may start any real-physics macro
// (walk, timed walk, jump with hold patterns, or stand still) after a reaction delay. Success = no ink / boss-body hit during the next 150 frames.
// usage: node test/qa_balance_ink.mjs [trials]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const trials = +process.argv[2] || 3000; const MODE = process.argv[3] || 'both'; const FAN = process.argv[4] || 'std';   // both | ink | body
const lib = fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_botlib.js'), 'utf8');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
const r = await t.page.evaluate(([trials, MODE, FAN]) => {
  const { G, D, MACROS, runMacro, macroIn, buildGraph, overlapR } = QB;
  fz.start(1, 30, 1); D.skipIntro(); const S = D._S(); QB.setSolid(S.solid);
  buildGraph([[24, 200], [216, 200]]);
  const nodes = [...QB.GR.nodes.values()];
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const DELAYS = [0, 12, 24, 36], T = 150;
  const bins = [[0, 40], [40, 80], [80, 120], [120, 160], [160, 400]];
  const stats = DELAYS.map(() => bins.map(() => ({ n: 0, stand: 0, any: 0 })));
  const cache = new Map();
  const pathOf = (n, mi) => { const k = n.k + ':' + mi; let v = cache.get(k); if (!v) { const r = runMacro({ x: n.x, y: n.y, vy: 0, g: true, jb: 0 }, MACROS[mi], true); v = r.path; cache.set(k, v); } return v; };
  for (let tr = 0; tr < trials; tr++) {
    const n = nodes[Math.floor(rnd() * nodes.length)];
    const bx = 16 + rnd() * 176, by = 24 + rnd() * 144, jx = rnd() < 0.5 ? -1 : 1, jy = rnd() < 0.5 ? -1 : 1, frac = rnd(), spd = 0.8 + 0.6 * (1 - frac);
    const cx = bx + 24, cy = by + 24, px = n.x + 8, py = n.y + 8;
    const dist = Math.hypot(px - cx, py - cy);
    // skip positions where the player would already overlap the boss body at fire time
    if (overlapR([bx + 6, by + 6, 36, 36], [n.x + 2, n.y + 2, 12, 14])) continue;
    const base = Math.atan2(py - cy, px - cx);
    const bullets = []; const ks = FAN === 'even4' ? [-1.5, -0.5, 0.5, 1.5] : [-2, -1, 0, 1, 2]; for (const k of ks) { const a = base + k * 0.3; bullets.push({ x: cx - 4, y: cy - 4, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4 }); }
    // boss path
    const bossPath = []; { let x = bx, y = by, ax = jx, ay = jy; for (let f = 1; f <= T; f++) { x += ax * spd; y += ay * spd; if (x < 16) { x = 16; ax = 1; } else if (x > 192) { x = 192; ax = -1; } if (y < 24) { y = 24; ay = 1; } else if (y > 168) { y = 168; ay = -1; } bossPath.push([x + 6, y + 6, 36, 36]); } }
    const dead = (pf, f) => {                                 // player origin pf at frame f (1-based)
      const pr = [pf[0] + 2, pf[1] + 2, 12, 14];
      if (MODE !== 'ink' && overlapR(bossPath[f - 1], pr)) return true;
      if (MODE !== 'body') for (const b of bullets) { const qx = b.x + b.vx * f, qy = b.y + b.vy * f; if (qx + 4 < 16 || qx + 4 > 240 || qy + 4 < 24 || qy + 4 > 216) continue; if (overlapR([qx + 1, qy + 1, 6, 6], pr)) return true; }
      return false;
    };
    const bi = bins.findIndex((b) => dist >= b[0] && dist < b[1]);
    DELAYS.forEach((d, di) => {
      let standOK = true;
      for (let f = 1; f <= T; f++) if (dead([n.x, n.y], f)) { standOK = false; break; }
      let anyOK = standOK;
      if (!anyOK) {
        for (let mi = 0; mi < MACROS.length && !anyOK; mi++) {
          const path = pathOf(n, mi); let ok = true;
          for (let f = 1; f <= T && ok; f++) {
            let pf;
            if (f <= d) pf = [n.x, n.y]; else { const k = f - d - 1; pf = k < path.length ? path[k] : path[path.length - 1]; if (!path.length) pf = [n.x, n.y]; }
            if (dead(pf, f)) ok = false;
          }
          if (ok) anyOK = true;
        }
      }
      const s = stats[di][bi]; s.n++; if (standOK) s.stand++; if (anyOK) s.any++;
    });
  }
  return { bins, DELAYS, stats };
}, [trials, MODE, FAN]);
console.log('MODE', MODE, 'FAN', FAN, '- ink fan dodge-ability (share of trials where SOME real-physics macro avoids all 5 bullets + boss body for 150 frames)');
console.log('boss->player distance:', r.bins.map((b) => b[0] + '-' + b[1]).join('  '));
r.DELAYS.forEach((d, di) => console.log(`reaction ${String(d).padStart(2)}f (${(d / 60 * 1000).toFixed(0)}ms): ` + r.stats[di].map((s) => `${s.n ? (100 * s.any / s.n).toFixed(0) : '-'}% (stand-still ${s.n ? (100 * s.stand / s.n).toFixed(0) : '-'}%, n=${s.n})`).join('  |  ')));
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
