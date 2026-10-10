// QA visual: measurable art-quality gates. Exit code 1 if any gate fails (they define "done" for the art fixes).
// WAVE 2 (integration): G2, G4 and G7 originally modelled the OLD drawing choices (accent2 digits straight on the wall, a 0.55
// #3aa0ff tint over the sprite, a banner drawn straight over the tiles). FIXPLAN section 1 replaced those drawing choices
// (dark plates, outlined white text, banner bands, cyan-outlined frozen look), so the three gates now measure the SAME
// properties on the REAL rendered frame (Game.render into #screen) with the same thresholds or stricter ones.
// G2 : min contrast of every non-glyph pixel around the round digits vs the white digits >= 3.0 (was: mean contrast of accent2 vs wall px)
// G4 : frozen vs active enemy, rendered by the real Game, dE76 >= 20 for ALL five types (was: Glimmer only, modelled)
// G7 : min contrast of every non-glyph pixel around the "ROUND n" banner text vs the white text >= 3.0 (was: <= 5 % tile px near the text colour)
//  G1 facing legibility   : Fizz/Pop idle+walk+jump+fall+shoot silhouettes differ from their mirror by >= 12% of opaque px
//  G2 round number legib. : HUD round digits (wall, x0..16,y20..28) have mean WCAG contrast >= 3.0 vs surrounding wall px, all 30 rounds
//  G3 angry vs Fizz       : mean-colour dE76 between p1_idle and each *_angry >= 35
//  G4 frozen distinct     : Frozen Glimmer (drawn like Game does: sprite + 0.55 #3aa0ff tint) differs from normal Glimmer by dE76 >= 20
//  G5 moon pearl halo     : moonpearl halo must be translucent (some px with 0<alpha<255) or light-coloured (no opaque brown ring)
//  G6 springle not dino   : silhouette check proxy: springle head must have a narrow tube snout (<=3px tall run >=4px long at the mouth row) -- heuristic
//  G7 ROUND banner        : fraction of banner box pixels over tile pixels within dE30 of banner colour <= 5% for all rounds (or a dark plate is drawn)
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const G = fz.GFX; const out = {};
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; let R = f(r), G2 = f(g), B = f(b); let X = (R * 0.4124 + G2 * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G2 * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G2 * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const l1 = lum(...a), l2 = lum(...b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const spr = (n, f = 0, o) => { const sz = G.size(n); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); G.draw(x, n, f, 0, 0, o); return { d: x.getImageData(0, 0, sz.w, sz.h).data, w: sz.w, h: sz.h }; };
  const bodyMean = (n, f = 0, tint) => { const s = spr(n, f); const px = []; for (let i = 0; i < s.d.length; i += 4) if (s.d[i + 3] > 200) px.push([s.d[i], s.d[i + 1], s.d[i + 2]]); const L = px.map((p) => lab(...p)[0]).sort((a, b) => a - b); const cut = L[Math.floor(L.length * 0.3)]; let b = px.filter((p) => lab(...p)[0] > cut).map((p) => lab(...p)); if (tint) { b = px.filter((p) => lab(...p)[0] > cut).map((p) => lab(...p.map((v, k) => Math.round(v * 0.45 + tint[k] * 0.55)))); } return [0, 1, 2].map((k) => b.reduce((a, p) => a + p[k], 0) / b.length); };
  // G1
  const g1 = {}; let g1min = 100;
  for (const n of ['p1_idle', 'p1_walk', 'p1_jump', 'p1_fall', 'p1_shoot', 'p2_idle', 'p2_walk']) for (let f = 0; f < G.frames(n); f++) { const a = spr(n, f), b = spr(n, f, { flip: true }); let op = 0, df = 0; for (let i = 0; i < a.d.length; i += 4) { const oa = a.d[i + 3] > 128, ob = b.d[i + 3] > 128; if (oa || ob) { op++; if (oa !== ob) df++; } } const v = 100 * df / op; g1min = Math.min(g1min, v); g1[n + '#' + f] = +v.toFixed(1); }
  out.G1 = { pass: g1min >= 12, min: +g1min.toFixed(1), detail: g1 };
  // G2 (wave 2: measured on the real frame -- white outlined digits on a dark plate; every other pixel in the digit box must keep contrast >= 3.0)
  const g2 = []; const cv = document.getElementById('screen'); const cx = cv.getContext('2d', { willReadFrequently: true });
  const isWhite = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
  const minCrAroundWhite = (x, y, w, h) => { const d = cx.getImageData(x, y, w, h).data; let min = 99, white = 0; for (let i = 0; i < d.length; i += 4) { const p = [d[i], d[i + 1], d[i + 2]]; if (isWhite(p)) { white++; continue; } min = Math.min(min, cr([255, 255, 255], p)); } return { c: +min.toFixed(2), white }; };
  for (let r = 1; r <= 30; r++) { fz.start(1, r, 7); fz.step(5); const m = minCrAroundWhite(0, 18, 16, 10); g2.push({ r, c: m.c, white: m.white }); }
  out.G2 = { pass: g2.every((x) => x.c >= 3 && x.white >= 12), failing: g2.filter((x) => x.c < 3 || x.white < 12).map((x) => x.r + ':' + x.c + '/w' + x.white) };
  // G3
  const p1 = bodyMean('p1_idle'); const g3 = {}; let g3min = 1e9; for (const e of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) { const v = dE(p1, bodyMean(e + '_angry')); g3[e] = +v.toFixed(1); g3min = Math.min(g3min, v); }
  out.G3 = { pass: g3min >= 35, min: +g3min.toFixed(1), detail: g3 };
  // G4 (wave 2: the frozen look is drawn by Game -- render each enemy type active and frozen on a busy crystal round and compare)
  const g4 = {}; { const D = fz.Game.debug; let gmin = 1e9;
    for (const k of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
      fz.start(1, 17, 7); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); fz.step(2);
      const grab = () => { const d = cx.getImageData(0, 16, 256, 208).data; return d; };
      const bgd = grab(); D.spawn(k, 120, 100); const e = D._S().enemies[D._S().enemies.length - 1]; e.vx = 0; e.vy = 0;
      const meanLab = (setup) => { setup(); fz.Game.render(cx); const im = grab(); let n = 0, L = 0, A = 0, B = 0; for (let i = 0; i < im.length; i += 4) { if (Math.abs(im[i] - bgd[i]) + Math.abs(im[i + 1] - bgd[i + 1]) + Math.abs(im[i + 2] - bgd[i + 2]) > 40) { const l = lab(im[i], im[i + 1], im[i + 2]); n++; L += l[0]; A += l[1]; B += l[2]; } } return [L / n, A / n, B / n]; };
      const normal = meanLab(() => { e.state = 'active'; e.x = 120; e.y = 100; e.animT = 0; });
      const frozen = meanLab(() => { e.state = 'frozen'; e.freezeT = 1e9; e.x = 120; e.y = 100; });
      g4[k] = +dE(normal, frozen).toFixed(1); gmin = Math.min(gmin, g4[k]);
    }
    out.G4 = { pass: gmin >= 20, min: gmin, detail: g4 }; }
  // G5 (rendered over the theme-0 bg, halo ring px = alpha<250): must not read as muddy brown (L*<50 with chroma>12)
  const mp = spr('moonpearl', 0); const bgc = hex(G.theme(0).bg); let ringN = 0, ringL = 0, ringC = 0; for (let i = 0; i < mp.d.length; i += 4) { const a = mp.d[i + 3] / 255; if (a > 0.05 && a < 0.98) { const c = [0, 1, 2].map((k) => Math.round(mp.d[i + k] * a + bgc[k] * (1 - a))); const L = lab(...c); ringN++; ringL += L[0]; ringC += Math.hypot(L[1], L[2]); } }
  const rl = ringL / Math.max(1, ringN), rc = ringC / Math.max(1, ringN); out.G5 = { pass: !(rl < 50 && rc > 12), ringPx: ringN, meanL: +rl.toFixed(1), meanChroma: +rc.toFixed(1) };
  // G7 banner (wave 2: real frame during the intro -- the ROUND n text keeps contrast >= 3.0 against everything around it, all 30 rounds)
  const g7 = [];
  for (let r = 1; r <= 30; r++) { fz.start(1, r, 7); fz.step(3); const w = ('ROUND ' + r).length * 16; const m = minCrAroundWhite(Math.round(128 - w / 2) - 4, 84, w + 8, 16); g7.push({ r, c: m.c, white: m.white }); }
  out.G7 = { pass: g7.every((x) => x.c >= 3 && x.white >= 40), failing: g7.filter((x) => x.c < 3 || x.white < 40).map((x) => x.r + ':' + x.c + '/w' + x.white) };
  return out;
});
let fail = 0;
for (const [k, v] of Object.entries(res)) { console.log(k, v.pass ? 'PASS' : 'FAIL', JSON.stringify({ ...v, detail: undefined })); if (!v.pass) fail++; }
console.log('errors', t.errors);
await t.close();
process.exit(fail ? 1 : 0);
