// QA visual: measurable art-quality gates. Exit code 1 if any gate fails (they define "done" for the art).
// v2.0 (Abyss Glow) RE-BASE (SPEC_V2 section 7): the pixel-era gates read 1:1 pixels of a 256x224 canvas and judged opaque palette colours.
// The new look is resolution independent (canvas = 256k x 224k, thin glowing strokes, translucent halos, soft dark pools instead of plates),
// so every gate keeps its INTENT (legibility, distinctness, contrast) but is measured on the REAL rendered frame at the game's bake scale k
// (Game.render into an off-screen k-scaled canvas, exactly like Main) with the text suppressed where the question is "does the text read on what is
// behind it?" (same technique as test/game_visual.mjs V1/V2/V3, here against the built dist/fizzpop.html):
//  G1 facing legibility   : Fizz/Pop idle+walk+jump+fall+shoot silhouettes differ from their mirror by >= 12% of visible px (alpha > 0.3)       (unchanged threshold)
//  G2 round number legib. : HUD round digits, all 30 rounds: the background behind the digit box (digits suppressed) keeps WCAG contrast >= 3.0 against the white-hot digit core
//  G3 angry vs Fizz       : mean-colour dE76 between p1_idle and each *_angry >= 35 (alpha-weighted, lit pixels only)                           (unchanged threshold)
//  G4 frozen distinct     : frozen vs active enemy rendered by the real Game (tint + sparkles), dE76 >= 20 for ALL five types                  (unchanged threshold)
//  G5 moon pearl halo     : the halo is light or low-chroma, never a muddy dark-brown ring (un-premultiplied halo colours: not (L* < 50 and chroma > 12)); and it is translucent
//  G7 ROUND banner        : the background behind the "ROUND n" text (text suppressed) keeps contrast >= 3.0 against the white-hot text, all 30 rounds
// (G6 "springle is not a dino" was a 16-px-grid heuristic; its intent -- the Springle silhouette is distinct from every other creature -- is covered by test/v2_cast_test.mjs "enemy silhouettes pairwise distinct".)
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const G = fz.GFX; const out = {};
  const K = fz._main && fz._main.k ? fz._main.k() : 2;
  const lin = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
  const lab = (r, g, b) => { const R = lin(r), G2 = lin(g), B = lin(b); const X = (R * 0.4124 + G2 * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G2 * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G2 * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // the real Game frame at the bake scale, into an off-screen canvas that mirrors what Main sets up (setTransform(k), smoothing on)
  const frame = () => { const c = document.createElement('canvas'); c.width = 256 * K; c.height = 224 * K; const x = c.getContext('2d', { willReadFrequently: true }); x.setTransform(K, 0, 0, K, 0, 0); x.imageSmoothingEnabled = true; fz.Game.render(x); return x; };
  const raw = (x, X, Y, W, H) => x.getImageData(Math.round(X * K), Math.round(Y * K), Math.max(1, Math.round(W * K)), Math.max(1, Math.round(H * K))).data;
  const withoutText = (pred, fn) => { const o = G.text; G.text = (c, s, ...r) => (pred(String(s)) ? 0 : o.call(G, c, s, ...r)); try { return fn(); } finally { G.text = o; } };
  // sprites rendered at the bake scale with a 10-unit margin so luminous overdraw is never clipped
  const SM = 10;
  const spr = (n, f = 0, o) => { const sz = G.size(n); const c = document.createElement('canvas'); c.width = Math.ceil((sz.w + 2 * SM) * K); c.height = Math.ceil((sz.h + 2 * SM) * K); const x = c.getContext('2d', { willReadFrequently: true }); x.setTransform(K, 0, 0, K, 0, 0); G.draw(x, n, f, SM, SM, o); return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
  // G1
  const g1 = {}; let g1min = 100;
  for (const n of ['p1_idle', 'p1_walk', 'p1_jump', 'p1_fall', 'p1_shoot', 'p2_idle', 'p2_walk']) for (let f = 0; f < G.frames(n); f++) {
    const a = spr(n, f), b = spr(n, f, { flip: true }); let op = 0, df = 0;
    // flipped vs unflipped silhouette (GFX flips about the box centre, pad included): a facing cue must survive the mirror
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = (y * a.w + x) * 4; const oa = a.d[i + 3] > 77, ob = b.d[i + 3] > 77; if (oa || ob) { op++; if (oa !== ob) df++; } }
    const v = 100 * df / Math.max(1, op); g1min = Math.min(g1min, v); g1[n + '#' + f] = +v.toFixed(1);
  }
  out.G1 = { pass: g1min >= 12, min: +g1min.toFixed(1), detail: g1 };
  // G2: HUD round digits (left wall, digits box x 0..16, y 20..29), 30 rounds
  const g2 = []; const WHITE_HOT = lum(0xea, 0xff, 0xff);
  for (let r = 1; r <= 30; r++) {
    fz.start(1, r, 7); fz.step(5);
    const bg = withoutText((s) => /^\d\d$/.test(s), () => { const d = raw(frame(), 0, 20, 16, 9), o = []; for (let i = 0; i < d.length; i += 4) o.push(lum(d[i], d[i + 1], d[i + 2])); return o; });
    g2.push({ r, c: +contrast(WHITE_HOT, pct(bg, 0.99)).toFixed(2) });
  }
  out.G2 = { pass: g2.every((x) => x.c >= 3), failing: g2.filter((x) => x.c < 3).map((x) => x.r + ':' + x.c), min: Math.min(...g2.map((x) => x.c)) };
  // G3: alpha-weighted mean colour of the lit pixels (top 70% by luminance, alpha > 0.5); angry enemies must stay far from Fizz
  const bodyMean = (n, f = 0) => { const s = spr(n, f); const px = []; for (let i = 0; i < s.d.length; i += 4) if (s.d[i + 3] > 128) px.push([s.d[i], s.d[i + 1], s.d[i + 2]]); const L = px.map((p) => lab(...p)[0]).sort((a, b) => a - b); const cut = L[Math.floor(L.length * 0.3)]; const b = px.filter((p) => lab(...p)[0] > cut).map((p) => lab(...p)); return [0, 1, 2].map((k) => b.reduce((a, p) => a + p[k], 0) / b.length); };
  const p1 = bodyMean('p1_idle'); const g3 = {}; let g3min = 1e9;
  for (const e of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) { const v = dE(p1, bodyMean(e + '_angry')); g3[e] = +v.toFixed(1); g3min = Math.min(g3min, v); }
  out.G3 = { pass: g3min >= 35, min: +g3min.toFixed(1), detail: g3 };
  // G4: frozen vs active on a busy crystal round, rendered by the real Game at k
  const g4 = {}; { const D = fz.Game.debug; let gmin = 1e9;
    for (const k of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
      fz.start(1, 17, 7); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); fz.step(2);
      const grab = () => { const d = raw(frame(), 0, 16, 256, 208), o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o; };
      const bgd = grab(); D.spawn(k, 120, 100); const e = D._S().enemies[D._S().enemies.length - 1]; e.vx = 0; e.vy = 0;
      const meanLab = (setup) => { setup(); const im = grab(); let n = 0, L = 0, A = 0, B = 0; for (let i = 0; i < im.length; i++) { const a = im[i], b = bgd[i]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60) { const l = lab(...a); n++; L += l[0]; A += l[1]; B += l[2]; } } return [L / n, A / n, B / n]; };
      const normal = meanLab(() => { e.state = 'active'; e.x = 120; e.y = 100; e.animT = 0; });
      const frozen = meanLab(() => { e.state = 'frozen'; e.freezeT = 1e9; e.x = 120; e.y = 100; });
      g4[k] = +dE(normal, frozen).toFixed(1); gmin = Math.min(gmin, g4[k]);
    }
    out.G4 = { pass: gmin >= 20, min: gmin, detail: g4 }; }
  // G5: the baked moon pearl: halo pixels (0.05 < alpha < 0.98) keep a LIGHT / low-chroma colour (un-premultiplied), and the halo is translucent
  const mp = spr('moonpearl', 0); let ringN = 0, ringL = 0, ringC = 0;
  for (let i = 0; i < mp.d.length; i += 4) { const a = mp.d[i + 3] / 255; if (a > 0.05 && a < 0.98) { const L = lab(mp.d[i], mp.d[i + 1], mp.d[i + 2]); ringN++; ringL += L[0]; ringC += Math.hypot(L[1], L[2]); } }
  const rl = ringL / Math.max(1, ringN), rc = ringC / Math.max(1, ringN); out.G5 = { pass: ringN > 50 && !(rl < 50 && rc > 12), ringPx: ringN, meanL: +rl.toFixed(1), meanChroma: +rc.toFixed(1) };
  // G7 banner: ROUND n (first intro frames, centred at y 84..100, scale 2), text suppressed -> contrast of the white-hot text vs the 99th percentile background luminance
  const g7 = [];
  for (let r = 1; r <= 30; r++) {
    fz.start(1, r, 7); fz.step(3); const w = ('ROUND ' + r).length * 16;
    const bg = withoutText((s) => s.startsWith('ROUND '), () => { const d = raw(frame(), Math.round(128 - w / 2) - 4, 84, w + 8, 16), o = []; for (let i = 0; i < d.length; i += 4) o.push(lum(d[i], d[i + 1], d[i + 2])); return o; });
    g7.push({ r, c: +contrast(WHITE_HOT, pct(bg, 0.99)).toFixed(2) });
  }
  out.G7 = { pass: g7.every((x) => x.c >= 3), failing: g7.filter((x) => x.c < 3).map((x) => x.r + ':' + x.c), min: Math.min(...g7.map((x) => x.c)) };
  return out;
});
let fail = 0;
for (const [k, v] of Object.entries(res)) { console.log(k, v.pass ? 'PASS' : 'FAIL', JSON.stringify({ ...v, detail: undefined })); if (!v.pass) fail++; }
console.log('errors', t.errors);
await t.close();
process.exit(fail || t.errors.length ? 1 : 0);
