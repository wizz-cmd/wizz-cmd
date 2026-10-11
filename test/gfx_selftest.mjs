// GFX self test (in addition to tools/check_gfx.mjs): node test/gfx_selftest.mjs   (v2.0 re-base: runs at an explicit bake scale; pixel palette budget -> bake-cache memory bounds;
// 1 px drop shadows under platforms -> bright top edge; see SPEC_V2 section 7)
// Checks: contract conformance (runs check_gfx), lint, animation frames differ, palette budget, init time,
// text API edge cases, 30 distinct level looks + solid body / bright top edge / transparency + contrast, draw() robustness,
// ctx state hygiene (alpha / smoothing), lazy boss sprites, logo animation. Exit 1 on failure.
import path from 'path';
import { spawnSync } from 'child_process';
import { launch, PROJECT } from '../tools/harness.mjs';

const html = path.join(PROJECT, 'test', 'gfx_sheet.html');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };

// 1) contract conformance
const cg = spawnSync('node', [path.join(PROJECT, 'tools', 'check_gfx.mjs'), html], { encoding: 'utf8' });
check('tools/check_gfx.mjs passes', cg.status === 0, cg.stdout.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 5).join(' | '));

// 2) init time, median of 5 fresh page loads (init runs at page load in gfx_sheet.html)
const times = [];
for (let i = 0; i < 5; i++) { const t = await launch({ html }); times.push(await t.page.evaluate(() => T.initMs)); await t.close(); }
times.sort((a, b) => a - b);
check(`GFX.init() < 150 ms (median ${times[2].toFixed(1)} ms, runs ${times.map((x) => x.toFixed(0)).join('/')})`, times[2] < 150);

const t = await launch({ html });
const warns = [];
t.page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });

const r = await t.page.evaluate(() => {
  const out = { fails: [], notes: [] };
  const fail = (m) => out.fails.push(m);
  const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pix = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const hash = (d) => { let h = 2166136261; for (let k = 0; k < d.length; k++) h = Math.imul(h ^ d[k], 16777619); return h >>> 0; };
  const reg = GFX._registry();
  const K = 2; GFX.setScale(K);                       // v2: every raster check runs at an explicit bake scale, drawing under setTransform(K)
  const M = 10;                                       // logical margin around the registry box so luminous overdraw is never clipped
  const sprCanvas = (name, f, o) => { const sz = GFX.size(name); const c = mkc((sz.w + 2 * M) * K, (sz.h + 2 * M) * K); const g = c.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0); GFX.draw(g, name, f, M, M, o); return c; };

  // every frame drawn once -> forces lazy sprites, then lint must be empty
  GFX.sheet();
  const lint = GFX._lint();
  if (lint.length) fail('lint: ' + lint.slice(0, 5).join(' | '));

  // animation frames must differ (v1 intent kept: no accidentally duplicated frame)
  const dupFrames = [];
  for (const { name, frames } of reg) {
    const hs = [];
    for (let f = 0; f < frames; f++) hs.push(hash(pix(sprCanvas(name, f))));
    for (let i = 0; i < frames; i++) for (let j = i + 1; j < frames; j++) if (hs[i] === hs[j]) dupFrames.push(`${name} ${i}=${j}`);
  }
  if (dupFrames.length) fail('identical animation frames: ' + dupFrames.join(', '));

  // v2 replacement of the pixel palette budget: bake-cache memory bounds (SPEC_V2 section 7). Every sprite x frame baked at k=4 and k=8 must stay under the cap and be evictable.
  { const mem = [];
    for (const kk of [4, 8]) {
      GFX.setScale(kk);
      const big = mkc(64, 64), bg = big.getContext('2d'); bg.setTransform(kk, 0, 0, kk, 0, 0);
      for (const { name, frames } of reg) { if (/^(kraken|moonpearl)/.test(name)) continue; for (let f = 0; f < frames; f++) { bg.clearRect(0, 0, 64, 64); GFX.draw(bg, name, f, 2, 2); } }
      const st = GFX._stats(); mem.push([kk, st.px, st.maxPx, st.evictions]);
      if (st.px > st.maxPx * 1.05) fail(`bake cache over its cap at k=${kk}: ${st.px} px > ${st.maxPx}`);
    }
    out.notes.push('bake cache (k, px, cap, evictions): ' + JSON.stringify(mem));
    GFX.setScale(K); }

  // draw() robustness
  const c = mkc(32 * K, 32 * K), g = c.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
  try {
    GFX.draw(g, 'p1_idle', -3, 0, 0); GFX.draw(g, 'p1_idle', 7.9, 0, 0); GFX.draw(g, 'p1_idle', NaN, 0, 0); GFX.draw(g, 'p1_idle', 1e9, 0, 0);
    GFX.draw(g, 'p1_idle', 0, NaN, 3.5); GFX.draw(g, 'p1_idle', 0, 0.5, -0.5, { alpha: 0 });
    GFX.draw(g, 'no_such_sprite', 0, 0, 0); GFX.draw(g, 'no_such_sprite', 0, 0, 0);
    GFX.draw(g, 'p1_idle', 0, 0, 0, { tint: 'not a colour', glow: -4 }); GFX.draw(g, 'p1_idle', 0, 0, 0, { tint: '#4fc8ff', glow: 9, flip: true, white: true });
  } catch (e) { fail('draw threw: ' + e.message); }
  if (hash(pix(sprCanvas('bubble', 3))) !== hash(pix(sprCanvas('bubble', 1)))) fail('frame index must wrap modulo the frame count (3 -> 1 for 2 frames)');
  g.globalAlpha = 0.7; g.imageSmoothingEnabled = true;
  GFX.draw(g, 'p1_idle', 0, 0, 0, { alpha: 0.5 }); GFX.text(g, 'HI', 0, 0, '#fff', { scale: 3 }); GFX.drawLogo(g, 16, 0, 5); GFX.draw(g, 'p1_idle', 0, 0, 0, { white: true, flip: true });
  GFX.particle(g, 'dot', 8, 8, 2, '#fff', 1); GFX.particle(g, 'ring', 8, 8, 4, '#fff', 1); GFX.postFX(g, 2);
  if (Math.abs(g.globalAlpha - 0.7) > 1e-6) fail('GFX calls must leave ctx.globalAlpha untouched, got ' + g.globalAlpha);
  if (g.imageSmoothingEnabled !== true) fail('GFX calls must restore imageSmoothingEnabled');
  if (g.globalCompositeOperation !== 'source-over') fail('GFX calls must restore globalCompositeOperation, got ' + g.globalCompositeOperation);
  // tint / glow / white options really do something (v2 additions)
  { const base = hash(pix(sprCanvas('nibbler_move', 0))); const tinted = hash(pix(sprCanvas('nibbler_move', 0, { tint: '#4fc8ff' }))); const white = hash(pix(sprCanvas('nibbler_move', 0, { white: true })));
    if (base === tinted || base === white || tinted === white) fail('tint / white options must change the picture'); }

  // lazy boss sprites: sizes known before building, white silhouettes work
  for (const [n, w, h, f] of [['kraken', 48, 48, 2], ['kraken_angry', 48, 48, 2], ['kraken_trapped', 64, 64, 1], ['moonpearl', 32, 32, 2]]) {
    const s = GFX.size(n); if (s.w !== w || s.h !== h || GFX.frames(n) !== f) fail(`${n}: size/frames ${s.w}x${s.h}/${GFX.frames(n)}`);
  }

  // text API
  if (GFX.textWidth('') !== 0 || GFX.textWidth('A', 3) !== 24 || GFX.textWidth('♥★', 1) !== 16) fail('textWidth');
  try { GFX.text(g, '', 0, 0); GFX.text(g, 12345, 0, 0); GFX.text(g, 'x'.repeat(200), 0, 0, 'rgba(255,0,0,0.5)'); GFX.text(g, 'A', 0, 0, '#12345678'); } catch (e) { fail('text threw: ' + e.message); }
  { const tc = mkc(40 * K, 20 * K), tg = tc.getContext('2d'); tg.setTransform(K, 0, 0, K, 0, 0); GFX.text(tg, 'A', 0, 0, '#fff', { shadow: true });
    const d = pix(tc); let shadowPx = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] < 60) shadowPx++;
    if (!shadowPx) fail('text shadow (soft dark halo) not visible'); }

  // level looks (v2): canvases are 256b x 208b; the crystal platform is solid-looking with a bright top edge; the arena stays transparent
  const map = Array.from({ length: 26 }, (_, r) => (r === 0 || r === 25) ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
  map[12] = '##........############........##';
  const seen = new Set(); const lum = (r, g2, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  let minContrast = 99, minWhere = -1, minEdge = 99;
  for (let i = 0; i < 30; i++) {
    const cv = GFX.levelCanvas(i, map); const b = cv.width / 256;
    if (!(b >= 1 && b <= 6) || cv.height !== 208 * b) { fail(`look ${i} size ${cv.width}x${cv.height}`); continue; }
    const dd = pix(cv); seen.add(hash(dd)); const W = cv.width;
    const A = (x, y) => dd[(Math.round(y * b) * W + Math.round(x * b)) * 4 + 3];
    if (A(100, 12 * 8 + 4) < 170) fail(`look ${i}: platform body too transparent (alpha ${A(100, 12 * 8 + 4)})`);
    if (A(128, 60) !== 0) fail(`look ${i}: arena not transparent`);
    // the top edge row of the platform is brighter than its body (SPEC_V2 2: "bright top edge")
    const rowLum = (y) => { let r = 0, gg = 0, bb = 0, n = 0; for (let x = 80; x < 150; x++) { const k = (Math.round(y * b) * W + Math.round(x * b)) * 4; r += dd[k]; gg += dd[k + 1]; bb += dd[k + 2]; n++; } return lum(r / n, gg / n, bb / n); };
    let edge = 0; for (let y = 12 * 8 - 1; y <= 12 * 8 + 2; y += 0.5) edge = Math.max(edge, rowLum(y));
    const body = rowLum(12 * 8 + 5); const edgeRatio = (edge + 0.02) / (body + 0.02); if (edgeRatio < minEdge) minEdge = edgeRatio;
    if (edgeRatio < 1.5) fail(`look ${i}: platform top edge is not clearly brighter than the body (ratio ${edgeRatio.toFixed(2)})`);
    // mean tile colour of the platform vs the bubble's ring / rim luminance
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let y = 12 * 8; y < 12 * 8 + 8; y++) for (let x = 80; x < 150; x++) { const k = (Math.round(y * b) * W + Math.round(x * b)) * 4; r += dd[k]; gg += dd[k + 1]; bb += dd[k + 2]; n++; }
    const L = lum(r / n, gg / n, bb / n);
    const ratio = Math.max(contrast(L, lum(0xa6, 0xf1, 0xff)), contrast(L, lum(0x1c, 0x4f, 0xa8)));
    if (ratio < minContrast) { minContrast = ratio; minWhere = i; }
    const th = GFX.theme(i); if (!/^#[0-9a-f]{6}$/i.test(th.bg + '') || !th.name) fail('theme ' + i);
  }
  if (seen.size !== 30) fail(`30 distinct looks expected, got ${seen.size}`);
  out.notes.push(`min bubble-vs-tile contrast ratio ${minContrast.toFixed(2)} (look ${minWhere}); min top-edge/body luminance ratio ${minEdge.toFixed(2)}`);
  if (minContrast < 1.5) fail(`bubble barely distinguishable on look ${minWhere}: ${minContrast.toFixed(2)}`);

  // logo animates and is reasonably sized (logical px)
  GFX.setScale(2);
  const lc = (t) => { const cv = mkc(256 * 2, 64 * 2); const lg = cv.getContext('2d'); lg.setTransform(2, 0, 0, 2, 0, 0); GFX.drawLogo(lg, 128, 8, t); return cv; };
  if (hash(pix(lc(0))) === hash(pix(lc(33)))) fail('logo static');
  const dl = pix(lc(0)); let minX = 999, maxX = 0, minY = 999, maxY = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 512; x++) if (dl[(y * 512 + x) * 4 + 3] > 100) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const lw = (maxX - minX + 1) / 2, lh = (maxY - minY + 1) / 2;
  out.notes.push(`logo bounds ${lw} x ${lh} logical px`);
  if (lw < 180 || lw > 250) fail('logo width ' + lw);
  // wave 2 contract extensions: bgCanvas + text outline (details: test/gfx_bg.mjs, test/gfx_text.mjs)
  if (typeof GFX.bgCanvas !== 'function') fail('GFX.bgCanvas missing');
  else {
    const b0 = GFX.bgCanvas(0), b29 = GFX.bgCanvas(29), bb = b0.width / 256;
    if (!(bb >= 1 && bb <= 4) || b0.height !== 208 * bb || GFX.bgCanvas(0) !== b0 || b0 === b29) fail('bgCanvas size/cache');
    const bd = pix(b0); let opaque = true; for (let i = 3; i < bd.length; i += 4) if (bd[i] !== 255) { opaque = false; break; } if (!opaque) fail('bgCanvas must be opaque');
    GFX.bgCanvas(-5); GFX.bgCanvas(99); GFX.bgCanvas(NaN);      // out-of-range indices are clamped, never throw
  }
  { const oc = mkc(40 * K, 20 * K), og = oc.getContext('2d'); og.setTransform(K, 0, 0, K, 0, 0); GFX.text(og, 'A', 4, 4, '#fff', { outline: '#f00' }); const od = pix(oc); let red = 0; for (let i = 0; i < od.length; i += 4) if (od[i + 3] > 30 && od[i] > 150 && od[i + 1] < 90) red++; if (red < 10) fail('text outline option draws nothing (red ' + red + ')'); }
  // enemy cast: every enemy_angry differs from its calm twin in colour (crimson contour is baked in, SPEC_V2 2)
  for (const e of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) { if (hash(pix(sprCanvas(e + '_move', 0))) === hash(pix(sprCanvas(e + '_angry', 0)))) fail(e + '_angry identical to ' + e + '_move'); }
  out.notes.push(`${reg.length} sprites, ${reg.reduce((a, s) => a + s.frames, 0)} frames`);
  return out;
});
r.fails.forEach((f) => check(f, false));
if (!r.fails.length) check('lint clean / frames differ / bake-cache bounds / draw+text robustness / looks / logo', true);
r.notes.forEach((n) => console.log('note: ' + n));
check('unknown sprite warns exactly once', warns.filter((w) => /no_such_sprite/.test(w)).length === 1, JSON.stringify(warns));
check('zero console/page errors', t.errors.length === 0, t.errors.join(' | '));
await t.close();
console.log(failed ? `\n${failed} failure(s)` : '\nall GFX self tests passed');
process.exit(failed ? 1 : 0);
