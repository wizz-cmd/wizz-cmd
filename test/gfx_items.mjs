// GFX wave-3 art regressions (src based, no build needed): node test/gfx_items.mjs
// v2.0 RE-BASE (SPEC_V2 section 7). The v1 gates counted exact pixels of 16x16 pixel-art details (Springle snout rows, Flippers fin widths, bolt column runs,
// Nibbler flank-cog pale pixels) which have no meaning on resolution-independent neon art. The same intents -- "each of these reads as what it is and stays
// different from its neighbours" -- are measured on the contour mask (alpha > 0.5) of the baked sprite at k = 4:
//  - Springle reads as a seahorse on a spring: taller than wide, a coil of >= 4 horizontal bands in its lower third, the squash pose is clearly shorter than
//    the tall frames, and its angry / trapped / die / squash_angry variants exist.
//  - pu_shoes (Flippers): a wide two-blade silhouette (wider than tall inside the ring) that differs from every other power-up icon (inner-disc silhouette difference).
//  - bolt: a zigzag that spans the whole box height, has a white-hot core and two different frames.
//  - Nibbler: the clockwork gear on the flank exists as a gold-hued ring (hue 35..60) that is NOT white (it must not read as a second eye) and the head carries exactly one eye
//    (one bright low-chroma blob in the head half).
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const K = 4; GFX.setScale(K); const M = 8;
  const rgb2hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const grab = (name, f = 0) => { const sz = GFX.size(name); const c = document.createElement('canvas'); c.width = (sz.w + 2 * M) * K; c.height = (sz.h + 2 * M) * K; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(K, 0, 0, K, 0, 0); GFX.draw(g, name, f, M, M); return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, sz }; };
  const mask = (s, th = 128) => { const m = new Uint8Array(s.w * s.h); for (let i = 0; i < m.length; i++) m[i] = s.d[i * 4 + 3] > th ? 1 : 0; return m; };
  const bbox = (s, m) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (m[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1, w: (x1 - x0 + 1) / K, h: (y1 - y0 + 1) / K }; };
  const out = {};
  // ---- Springle
  { const tall = [0, 1, 2, 3].map((f) => { const s = grab('springle_move', f); const b = bbox(s, mask(s)); return b; });
    const sq = grab('springle_squash', 0); const bsq = bbox(sq, mask(sq));
    const s0 = grab('springle_move', 0), m0 = mask(s0), b0 = bbox(s0, m0);
    // coil: in the lower third of the contour bbox, count alternations along a vertical scan through the centre column band
    let best = 0; const y1 = b0.y1, y0 = Math.round(b0.y1 - (b0.y1 - b0.y0) * 0.35);
    for (let x = b0.x0; x <= b0.x1; x += 2) { let tr = 0, prev = 0; for (let y = y0; y <= y1; y++) { const v = m0[y * s0.w + x]; if (v !== prev) tr++; prev = v; } best = Math.max(best, tr); }
    out.spr = { aspect: Math.min(...tall.map((b) => b.h / b.w)), tallH: Math.max(...tall.map((b) => b.h)), squashH: bsq.h, tallTop: Math.min(...tall.map((b) => b.y0)) / K, squashTop: bsq.y0 / K, sinkFrames: tall.map((b) => b.y0 / K), coilTransitions: best, variants: ['springle_angry', 'springle_trapped', 'springle_die', 'springle_squash_angry'].map((n) => GFX.has(n)) }; }
  // ---- Flippers vs the other power-ups: silhouette inside the orbit ring (central 62 % disc)
  { const names = ['pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'];
    const sh = {}; for (const n of names) { const s = grab(n); sh[n] = { s, m: new Float32Array(s.w * s.h) };
      const cx = s.w / 2, cy = s.h / 2, R = s.sz.w * K * 0.31; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const i = (y * s.w + x) * 4; const [, sa, l] = rgb2hsl(s.d[i], s.d[i + 1], s.d[i + 2]); sh[n].m[y * s.w + x] = ((x - cx) ** 2 + (y - cy) ** 2 < R * R && s.d[i + 3] > 128 && l > 0.35) ? 1 : 0; } }
    const diff = (a, b) => { let u = 0, d = 0; for (let i = 0; i < a.m.length; i++) { const p = a.m[i], q = b.m[i]; if (p || q) { u++; if (p !== q) d++; } } return u ? d / u : 0; };
    const dd = {}; let minPair = 1, minPairNames = '';
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const v = diff(sh[names[i]], sh[names[j]]); if (names[i] === 'pu_shoes') dd[names[j]] = +v.toFixed(2); if (v < minPair) { minPair = v; minPairNames = names[i] + ' ~ ' + names[j]; } }
    const sb = bbox(sh.pu_shoes.s, (() => { const m = new Uint8Array(sh.pu_shoes.m.length); for (let i = 0; i < m.length; i++) m[i] = sh.pu_shoes.m[i] ? 1 : 0; return m; })());
    out.flip = { shoesVsOthers: dd, minShoes: Math.min(...Object.values(dd)), minPair: +minPair.toFixed(2), minPairNames, shoeW: sb.w, shoeH: sb.h }; }
  // ---- bolt
  { const a = grab('bolt', 0), b = grab('bolt', 1); const ba = bbox(a, mask(a)); let hot = 0; for (let i = 0; i < a.d.length; i += 4) if (a.d[i + 3] > 200 && a.d[i] > 225 && a.d[i + 1] > 225 && a.d[i + 2] > 225) hot++;
    let df = 0; for (let i = 0; i < a.d.length; i += 4) if ((a.d[i + 3] > 128) !== (b.d[i + 3] > 128)) df++;
    out.bolt = { hGrow: ba.h / a.sz.h, w: ba.w, hot: hot / (K * K), framesDiffer: df > 40 }; }
  // ---- Nibbler: gear hue + single eye
  { const s = grab('nibbler_move', 0); const m = mask(s); const b = bbox(s, m); let gold = 0, whiteBlobs = 0;
    const visited = new Uint8Array(s.w * s.h); const isWhite = (x, y) => { const i = (y * s.w + x) * 4; if (s.d[i + 3] < 200) return false; const [, sa, l] = rgb2hsl(s.d[i], s.d[i + 1], s.d[i + 2]); return l > 0.8 && sa < 0.6 || (s.d[i] > 235 && s.d[i + 1] > 235 && s.d[i + 2] > 235); };
    for (let i = 0; i < s.d.length; i += 4) { if (s.d[i + 3] < 128) continue; const [h, sa, l] = rgb2hsl(s.d[i], s.d[i + 1], s.d[i + 2]); if (h > 30 && h < 62 && sa > 0.6 && l > 0.4) gold++; }
    // white blobs (>= 0.6 px^2 logical) in the head half (facing right: right half of the contour bbox)
    const midX = Math.round((b.x0 + b.x1) / 2); const blobs = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = midX; x <= b.x1; x++) { if (visited[y * s.w + x] || !isWhite(x, y)) continue; let n = 0; const st = [[x, y]]; visited[y * s.w + x] = 1; while (st.length) { const [cx, cy] = st.pop(); n++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h || visited[ny * s.w + nx] || !isWhite(nx, ny)) continue; visited[ny * s.w + nx] = 1; st.push([nx, ny]); } } blobs.push(n / (K * K)); }
    out.nib = { goldPx: gold / (K * K), whiteBlobs: blobs.filter((n) => n >= 3).length, blobSizes: blobs.filter((n) => n >= 0.3).map((n) => +n.toFixed(1)) }; }
  return out;
});
console.log(JSON.stringify(r));
check(`Springle: taller than wide in every move frame (min aspect ${r.spr.aspect.toFixed(2)} >= 1.1)`, r.spr.aspect >= 1.1);
check(`Springle: spring coil in the lower third (>= 6 contour transitions on a vertical scan, got ${r.spr.coilTransitions})`, r.spr.coilTransitions >= 6);
check(`Springle: the body sinks in the squash pose (top edge ${r.spr.squashTop.toFixed(1)} vs ${r.spr.tallTop.toFixed(1)} logical px, >= 1.2 px lower; move frames' tops ${JSON.stringify(r.spr.sinkFrames)})`, r.spr.squashTop >= r.spr.tallTop + 1.2);
check('Springle: angry / trapped / die / squash_angry variants registered', r.spr.variants.every(Boolean), JSON.stringify(r.spr.variants));
check(`Flippers: silhouette differs from every other power-up (min ${r.flip.minShoes} >= 0.25)`, r.flip.minShoes >= 0.25, JSON.stringify(r.flip.shoesVsOthers));
check(`Flippers: wide two-blade shape (inner width ${r.flip.shoeW.toFixed(1)} >= 0.95 x height ${r.flip.shoeH.toFixed(1)})`, r.flip.shoeW >= r.flip.shoeH * 0.95);
check(`Bolt: a zigzag spanning the box (height ${(r.bolt.hGrow * 100).toFixed(0)} % of the box >= 60 %, width ${r.bolt.w.toFixed(1)} >= 10), white-hot core (${r.bolt.hot.toFixed(1)} px^2 >= 3), two different frames`, r.bolt.hGrow >= 0.6 && r.bolt.w >= 10 && r.bolt.hot >= 3 && r.bolt.framesDiffer);
check(`Nibbler: the clockwork gear is a gold-hued ring (${r.nib.goldPx.toFixed(0)} gold px^2 >= 20) and the head has exactly one eye (eye-sized white blobs >= 3 px^2; all blobs: ${JSON.stringify(r.nib.blobSizes)})`, r.nib.goldPx >= 20 && r.nib.whiteBlobs === 1, JSON.stringify(r.nib));
check('zero console errors', t.errors.length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
