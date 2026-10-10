// Can P1 reach (pop) a bubble that hovers at each level's air attractor? Approximation: some P1-reachable standing position (validator BFS)
// from which a full jump (apex 44 px, ceiling clamp at y=24, <= ~58 px of air drift) overlaps the bubble's hit box.
import { boot, log } from './qa_codereview_lib.mjs';
import { reachability } from '../tools/validate_levels.mjs';
const b = await boot({});
const lv = await b.page.evaluate(() => fz.LEVELS.map((L) => ({ map: L.map, air: L.air, boss: L.boss })));
await b.t.close();
let bad = 0;
lv.forEach((L, i) => {
  const { reach } = reachability(L.map);
  const pos = [...reach].map((k) => ({ c: k % 32, s: Math.floor(k / 32) }));
  const out = [];
  for (const a of L.air) {
    // bubble centre = (a0*8, 16 + a1*8) per Game header comment -> box top-left = centre - 8
    const bx = a[0] * 8 - 8, by = 16 + a[1] * 8 - 8;
    // a hovering bubble wobbles: +-0.12 vertical; ceiling clamp keeps by >= 24
    const byc = Math.max(24, by);
    let best = null;
    for (const p of pos) {
      const feetY = 16 + p.s * 8, standY = feetY - 16;           // player top when standing
      const lo = Math.max(24, standY - 44), hi = standY;         // player top range during a full jump
      const vOk = lo < byc + 12 && hi > byc - 14;
      const px = p.c * 8 + 8;                                    // approx body centre x
      const dx = Math.abs(px - (bx + 8));
      if (vOk && dx <= 58 + 14) { best = p; break; }
    }
    if (!best) out.push(a.join(','));
  }
  if (out.length) { bad++; log(`R${i + 1}: air attractor(s) not poppable from any P1-reachable spot: ${out.join(' | ')} (all air: ${JSON.stringify(L.air)})`); }
});
log('levels with a possibly unpoppable attractor:', bad);
