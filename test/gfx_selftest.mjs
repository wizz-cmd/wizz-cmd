// GFX self test (in addition to tools/check_gfx.mjs): node test/gfx_selftest.mjs
// Checks: contract conformance (runs check_gfx), lint, animation frames differ, palette budget, init time,
// text API edge cases, 30 distinct level looks + shadows + transparency + contrast, draw() robustness,
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

  // every frame drawn once -> forces lazy sprites, then lint must be empty
  GFX.sheet();
  const lint = GFX._lint();
  if (lint.length) fail('lint: ' + lint.slice(0, 5).join(' | '));

  // animation frames must differ
  const dupFrames = [];
  const colourCounts = [];
  for (const { name, w, h, frames } of reg) {
    const hs = [], colours = new Set();
    for (let f = 0; f < frames; f++) {
      const c = mkc(w, h); GFX.draw(c.getContext('2d'), name, f, 0, 0);
      const d = pix(c); hs.push(hash(d));
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) colours.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]);
    }
    for (let i = 0; i < frames; i++) for (let j = i + 1; j < frames; j++) if (hs[i] === hs[j]) dupFrames.push(`${name} ${i}=${j}`);
    colourCounts.push([name, colours.size, w * h]);
  }
  if (dupFrames.length) fail('identical animation frames: ' + dupFrames.join(', '));
  const heavy = colourCounts.filter(([n, c, a]) => c > 10 && a <= 256 && !/^(bubble_|trap_overlay)/.test(n));
  if (heavy.length) fail('palette budget (> 10 colours incl. outline) on small sprites: ' + heavy.map((x) => x.slice(0, 2).join(':')).join(', '));

  // draw() robustness
  const c = mkc(32, 32), g = c.getContext('2d');
  try {
    GFX.draw(g, 'p1_idle', -3, 0, 0); GFX.draw(g, 'p1_idle', 7.9, 0, 0); GFX.draw(g, 'p1_idle', NaN, 0, 0); GFX.draw(g, 'p1_idle', 1e9, 0, 0);
    GFX.draw(g, 'p1_idle', 0, NaN, 3.5); GFX.draw(g, 'p1_idle', 0, 0.5, -0.5, { alpha: 0 });
    GFX.draw(g, 'no_such_sprite', 0, 0, 0); GFX.draw(g, 'no_such_sprite', 0, 0, 0);
  } catch (e) { fail('draw threw: ' + e.message); }
  const dA = mkc(16, 16), dB = mkc(16, 16);
  GFX.draw(dA.getContext('2d'), 'bubble', 3, 0, 0); GFX.draw(dB.getContext('2d'), 'bubble', 1, 0, 0);
  if (hash(pix(dA)) !== hash(pix(dB))) fail('frame index must wrap modulo the frame count (3 -> 1 for 2 frames)');
  g.globalAlpha = 0.7; g.imageSmoothingEnabled = true;
  GFX.draw(g, 'p1_idle', 0, 0, 0, { alpha: 0.5 }); GFX.text(g, 'HI', 0, 0, '#fff', { scale: 3 }); GFX.drawLogo(g, 16, 0, 5); GFX.draw(g, 'p1_idle', 0, 0, 0, { white: true, flip: true });
  if (Math.abs(g.globalAlpha - 0.7) > 1e-6) fail('GFX calls must leave ctx.globalAlpha untouched, got ' + g.globalAlpha);
  if (g.imageSmoothingEnabled !== true) fail('GFX calls must restore imageSmoothingEnabled');

  // lazy boss sprites: sizes known before building, white silhouettes work
  for (const [n, w, h, f] of [['kraken', 48, 48, 2], ['kraken_angry', 48, 48, 2], ['kraken_trapped', 64, 64, 1], ['moonpearl', 32, 32, 2]]) {
    const s = GFX.size(n); if (s.w !== w || s.h !== h || GFX.frames(n) !== f) fail(`${n}: size/frames ${s.w}x${s.h}/${GFX.frames(n)}`);
  }

  // text API
  if (GFX.textWidth('') !== 0 || GFX.textWidth('A', 3) !== 24 || GFX.textWidth('♥★', 1) !== 16) fail('textWidth');
  try { GFX.text(g, '', 0, 0); GFX.text(g, 12345, 0, 0); GFX.text(g, 'x'.repeat(200), 0, 0, 'rgba(255,0,0,0.5)'); GFX.text(g, 'A', 0, 0, '#12345678'); } catch (e) { fail('text threw: ' + e.message); }
  const tc = mkc(40, 20); GFX.text(tc.getContext('2d'), 'A', 0, 0, '#fff', { shadow: true });
  const d = pix(tc); let shadowPx = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] < 60) shadowPx++;
  if (!shadowPx) fail('text shadow not visible');

  // level looks
  const map = Array.from({ length: 26 }, (_, r) => (r === 0 || r === 25) ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
  map[12] = '##........############........##';
  const seen = new Set(); const lum = (r, g2, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  let minContrast = 99, minWhere = -1;
  for (let i = 0; i < 30; i++) {
    const cv = GFX.levelCanvas(i, map);
    if (cv.width !== 256 || cv.height !== 208) fail(`look ${i} size`);
    const dd = pix(cv); seen.add(hash(dd));
    const A = (x, y) => dd[(y * 256 + x) * 4 + 3];
    if (A(100, 12 * 8 + 4) !== 255) fail(`look ${i}: platform not opaque`);
    if (A(100, 12 * 8 + 9) === 0) fail(`look ${i}: no drop shadow under the platform`);
    if (A(100, 12 * 8 - 3) !== 0) fail(`look ${i}: shadow leaks above the platform`);
    if (A(128, 60) !== 0) fail(`look ${i}: arena not transparent`);
    // mean tile colour of the platform vs the bubble's ring / rim luminance
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = 12 * 8; y < 12 * 8 + 8; y++) for (let x = 80; x < 150; x++) { const k = (y * 256 + x) * 4; r += dd[k]; gg += dd[k + 1]; b += dd[k + 2]; n++; }
    const L = lum(r / n, gg / n, b / n);
    const ratio = Math.max(contrast(L, lum(0xa6, 0xf1, 0xff)), contrast(L, lum(0x1c, 0x4f, 0xa8)));
    if (ratio < minContrast) { minContrast = ratio; minWhere = i; }
    const th = GFX.theme(i); if (!/^#[0-9a-f]{6}$/i.test(th.bg + '') || !th.name) fail('theme ' + i);
  }
  if (seen.size !== 30) fail(`30 distinct looks expected, got ${seen.size}`);
  out.notes.push(`min bubble-vs-tile contrast ratio ${minContrast.toFixed(2)} (look ${minWhere})`);
  if (minContrast < 1.5) fail(`bubble barely distinguishable on look ${minWhere}: ${minContrast.toFixed(2)}`);

  // logo animates and is reasonably sized
  const lc = (t) => { const cv = mkc(256, 64); GFX.drawLogo(cv.getContext('2d'), 128, 8, t); return cv; };
  if (hash(pix(lc(0))) === hash(pix(lc(33)))) fail('logo static');
  const dl = pix(lc(0)); let minX = 999, maxX = 0, minY = 999, maxY = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) if (dl[(y * 256 + x) * 4 + 3] > 200) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  out.notes.push(`logo bounds ${maxX - minX + 1} x ${maxY - minY + 1}`);
  if (maxX - minX < 180 || maxX - minX > 250) fail('logo width ' + (maxX - minX + 1));
  // wave 2 contract extensions: bgCanvas + text outline (details: test/gfx_bg.mjs, test/gfx_text.mjs)
  if (typeof GFX.bgCanvas !== 'function') fail('GFX.bgCanvas missing');
  else {
    const b0 = GFX.bgCanvas(0), b29 = GFX.bgCanvas(29);
    if (b0.width !== 256 || b0.height !== 208 || GFX.bgCanvas(0) !== b0 || b0 === b29) fail('bgCanvas size/cache');
    const bd = pix(b0); let opaque = true; for (let i = 3; i < bd.length; i += 4) if (bd[i] !== 255) { opaque = false; break; } if (!opaque) fail('bgCanvas must be opaque');
    GFX.bgCanvas(-5); GFX.bgCanvas(99); GFX.bgCanvas(NaN);      // out-of-range indices are clamped, never throw
  }
  { const oc = mkc(40, 20); GFX.text(oc.getContext('2d'), 'A', 4, 4, '#fff', { outline: '#f00' }); const od = pix(oc); let red = 0; for (let i = 0; i < od.length; i += 4) if (od[i + 3] && od[i + 1] === 0) red++; if (red < 10) fail('text outline option draws nothing'); }
  // enemy cast: every enemy_angry differs from its calm twin in colour, and Springle / Crabbit have asymmetric / pincered silhouettes
  for (const e of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) { const a = mkc(16, 16), b = mkc(16, 16); GFX.draw(a.getContext('2d'), e + '_move', 0, 0, 0); GFX.draw(b.getContext('2d'), e + '_angry', 0, 0, 0); if (hash(pix(a)) === hash(pix(b))) fail(e + '_angry identical to ' + e + '_move'); }
  out.notes.push(`${reg.length} sprites, ${reg.reduce((a, s) => a + s.frames, 0)} frames`);
  return out;
});
r.fails.forEach((f) => check(f, false));
if (!r.fails.length) check('lint clean / frames differ / palette budget / draw+text robustness / looks / logo', true);
r.notes.forEach((n) => console.log('note: ' + n));
check('unknown sprite warns exactly once', warns.filter((w) => /no_such_sprite/.test(w)).length === 1, JSON.stringify(warns));
check('zero console/page errors', t.errors.length === 0, t.errors.join(' | '));
await t.close();
console.log(failed ? `\n${failed} failure(s)` : '\nall GFX self tests passed');
process.exit(failed ? 1 : 0);
