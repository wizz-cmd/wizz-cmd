#!/usr/bin/env node
// FIZZ & POP — tools/check_gfx.mjs
// Conformance check of a GFX implementation against SPEC §3.1 (sprite registry, font, tiles, theme,
// logo, sheet). Works on the built game (GFX via window.__fizzpop) or on any test page that loads
// 10_gfx.js as a classic script (global `GFX`).
//
// Usage: node tools/check_gfx.mjs [html]       (default dist/fizzpop.html)
// Exit 1 on any FAIL. Registry: test/stubs/sprite_registry.json (all 79 sprites of the SPEC table).
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from './harness.mjs';

const html = process.argv[2] || undefined;
const registry = JSON.parse(fs.readFileSync(path.join(PROJECT, 'test', 'stubs', 'sprite_registry.json'), 'utf8'));
const t = await launch({ html });

const report = await t.page.evaluate((registry) => {
  const out = { fails: [], notes: [] };
  const fail = (m) => out.fails.push(m);
  const G = (typeof GFX !== 'undefined') ? GFX : (window.__fizzpop && window.__fizzpop.GFX);
  if (!G) { fail('no GFX found (neither global GFX nor __fizzpop.GFX)'); return out; }
  try { G.init(); G.init(); } catch (e) { fail('init() threw: ' + e.message); return out; }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pix = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const opaqueCount = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; };

  // ---- sprites ----------------------------------------------------------------------------
  let blank = 0;
  for (const s of registry) {
    try {
      if (!G.has(s.name)) { fail(`missing sprite ${s.name}`); continue; }
      const sz = G.size(s.name);
      if (sz.w !== s.w || sz.h !== s.h) fail(`${s.name}: size ${sz.w}x${sz.h}, expected ${s.w}x${s.h}`);
      if (G.frames(s.name) !== s.frames) fail(`${s.name}: ${G.frames(s.name)} frames, expected ${s.frames}`);
      for (let f = 0; f < s.frames; f++) {
        const a = mk(s.w, s.h), b = mk(s.w, s.h), w = mk(s.w, s.h);
        G.draw(a.getContext('2d'), s.name, f, 0, 0);
        G.draw(b.getContext('2d'), s.name, f, 0, 0, { flip: true });
        G.draw(w.getContext('2d'), s.name, f, 0, 0, { white: true });
        const da = pix(a), db = pix(b), dw = pix(w);
        if (!opaqueCount(da)) { fail(`${s.name} frame ${f}: draws nothing`); blank++; continue; }
        // flip must mirror horizontally
        let mirrored = true;
        for (let y = 0; y < s.h && mirrored; y++) for (let x = 0; x < s.w; x++) {
          const i = (y * s.w + x) * 4, j = (y * s.w + (s.w - 1 - x)) * 4;
          if (da[i] !== db[j] || da[i + 1] !== db[j + 1] || da[i + 2] !== db[j + 2] || da[i + 3] !== db[j + 3]) { mirrored = false; break; }
        }
        if (!mirrored) fail(`${s.name} frame ${f}: flip:true is not an exact mirror`);
        // white silhouette: same alpha mask, all colour pixels white
        let whiteOk = true;
        for (let i = 0; i < dw.length; i += 4) {
          if (dw[i + 3] > 0 && (dw[i] !== 255 || dw[i + 1] !== 255 || dw[i + 2] !== 255)) { whiteOk = false; break; }
          if ((dw[i + 3] > 0) !== (da[i + 3] > 0)) { whiteOk = false; break; }
        }
        if (!whiteOk) fail(`${s.name} frame ${f}: white:true is not a pure-white silhouette of the sprite`);
      }
      // frame wraps modulo frame count; negative / large frames must not throw
      const c = mk(s.w, s.h); G.draw(c.getContext('2d'), s.name, s.frames * 3 + 1, 0, 0);
    } catch (e) { fail(`${s.name}: exception ${e.message}`); }
  }
  // alpha option
  try {
    const c = mk(16, 16); const g = c.getContext('2d');
    G.draw(g, 'p1_idle', 0, 0, 0, { alpha: 0.5 });
    const d = pix(c); let maxA = 0; for (let i = 3; i < d.length; i += 4) maxA = Math.max(maxA, d[i]);
    if (maxA > 140) fail(`draw alpha:0.5 produced alpha ${maxA}`);
    if (g.globalAlpha !== 1) fail('draw() left ctx.globalAlpha modified');
  } catch (e) { fail('alpha: ' + e.message); }

  // ---- font ---------------------------------------------------------------------------------
  try {
    if (G.textWidth('ABC') !== 24 || G.textWidth('ABC', 2) !== 48) fail(`textWidth wrong: ${G.textWidth('ABC')} / ${G.textWidth('ABC', 2)}`);
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.,:;-+=&'\"/()%*#<>_©♥★←→";
    for (const ch of glyphs) {
      const c = mk(8, 8); G.text(c.getContext('2d'), ch, 0, 0, '#fff', { shadow: false });
      if (!opaqueCount(pix(c))) fail(`font: glyph "${ch}" draws nothing`);
    }
    const lc = mk(8, 8), uc = mk(8, 8);
    G.text(lc.getContext('2d'), 'a', 0, 0, '#fff', { shadow: false }); G.text(uc.getContext('2d'), 'A', 0, 0, '#fff', { shadow: false });
    if (Array.from(pix(lc)).join() !== Array.from(pix(uc)).join()) fail('font: lower-case must render as upper-case');
    const sp = mk(8, 8); G.text(sp.getContext('2d'), ' ', 0, 0, '#fff', { shadow: false });
    if (opaqueCount(pix(sp))) fail('font: space must draw nothing');
    const un = mk(8, 8), q = mk(8, 8);
    G.text(un.getContext('2d'), 'é', 0, 0, '#fff', { shadow: false }); G.text(q.getContext('2d'), '?', 0, 0, '#fff', { shadow: false });
    if (Array.from(pix(un)).join() !== Array.from(pix(q)).join()) fail('font: unknown chars must map to "?"');
    // colour tint
    const red = mk(8, 8); G.text(red.getContext('2d'), 'H', 0, 0, '#ff0000', { shadow: false });
    const rd = pix(red); let reddish = 0, other = 0;
    for (let i = 0; i < rd.length; i += 4) if (rd[i + 3] > 200) { if (rd[i] > 200 && rd[i + 1] < 60 && rd[i + 2] < 60) reddish++; else other++; }
    if (!reddish || other > reddish * 0.1) fail(`font: colour tint wrong (red ${reddish}, other ${other})`);
    // alignment: centre / right shift the glyph block
    const probe = (align) => { const c = mk(64, 8); G.text(c.getContext('2d'), 'I', 32, 0, '#fff', { align, shadow: false }); const d = pix(c); let minX = 99; for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3] > 0 && x < minX) minX = x; return minX; };
    const l = probe('left'), c0 = probe('center'), r = probe('right');
    if (!(l > c0 && c0 > r) && !(l >= 32 && c0 >= 28 && c0 < l && r < c0)) fail(`font: align left/center/right gave first-pixel x ${l}/${c0}/${r}`);
    // shadow
    const sh = mk(10, 10); G.text(sh.getContext('2d'), 'I', 0, 0, '#fff', { shadow: true });
    const nsh = mk(10, 10); G.text(nsh.getContext('2d'), 'I', 0, 0, '#fff', { shadow: false });
    if (opaqueCount(pix(sh)) <= opaqueCount(pix(nsh))) fail('font: shadow:true adds no pixels');
    const sc = mk(32, 32); G.text(sc.getContext('2d'), 'I', 0, 0, '#fff', { scale: 2, shadow: false });
    const n1 = opaqueCount(pix(nsh)); const n2 = opaqueCount(pix(sc));
    if (n2 < n1 * 2.5) fail(`font: scale:2 should ~quadruple the pixels (${n1} -> ${n2})`);
  } catch (e) { fail('font exception: ' + e.message); }

  // ---- tiles / themes -----------------------------------------------------------------------
  try {
    const map = Array.from({ length: 26 }, (_, r) => (r === 0 || r === 25) ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
    const names = new Set();
    for (let i = 0; i < 30; i++) {
      const th = G.theme(i);
      for (const k of ['bg', 'accent', 'accent2']) if (!/^#[0-9a-fA-F]{6}$/.test(th[k] || '')) fail(`theme(${i}).${k} = ${th[k]} is not #rrggbb`);
      if (!th.name) fail(`theme(${i}) has no name`);
      names.add(th.name);
      const cv = G.levelCanvas(i, map);
      if (cv.width !== 256 || cv.height !== 208) { fail(`levelCanvas(${i}) is ${cv.width}x${cv.height}, expected 256x208`); continue; }
      if (G.levelCanvas(i, map) !== cv) fail(`levelCanvas(${i}) is not cached by index`);
      const d = pix(cv);
      const A = (c, r) => d[((r * 8 + 4) * 256 + c * 8 + 4) * 4 + 3];
      if (A(0, 5) !== 255) fail(`levelCanvas(${i}): wall tile not opaque`);
      if (A(16, 12) !== 0) fail(`levelCanvas(${i}): empty tile in the middle of the arena is not transparent (alpha ${A(16, 12)})`);
      const pxA = (x, y) => d[(y * 256 + x) * 4 + 3];
      if (i === 0 && pxA(17, 100) === 0 && pxA(100, 9) === 0) out.notes.push('levelCanvas: no drop shadow visible next to the left wall / under the ceiling');
    }
    if (names.size !== 6) fail(`theme names: expected 6 distinct, got ${names.size} (${[...names]})`);
    const bgs = new Set(); for (let i = 0; i < 30; i += 5) bgs.add(G.theme(i).bg); if (bgs.size !== 6) fail('theme bg colours of the 6 themes must be distinct');
    const hash = (d) => { let h = 2166136261; for (let k = 0; k < d.length; k++) h = Math.imul(h ^ d[k], 16777619); return h >>> 0; };
    const looks = new Set(); for (let i = 0; i < 5; i++) looks.add(hash(pix(G.levelCanvas(i, map))));
    if (looks.size < 2) fail('the 5 round variants inside a theme should look different');
  } catch (e) { fail('tiles/theme exception: ' + e.message); }

  // ---- logo / sheet -------------------------------------------------------------------------
  try {
    const c = mk(256, 224); G.drawLogo(c.getContext('2d'), 128, 20, 0);
    const n = opaqueCount(pix(c)); if (n < 1500) fail(`drawLogo draws too little (${n} px)`);
    const c2 = mk(256, 224); G.drawLogo(c2.getContext('2d'), 128, 20, 30);
    if (Array.from(pix(c)).join() === Array.from(pix(c2)).join()) fail('drawLogo is not animated by t');
    const sh = G.sheet(); if (!sh || !sh.width || !sh.height) fail('sheet() did not return a canvas');
  } catch (e) { fail('logo/sheet exception: ' + e.message); }

  out.notes.push(`checked ${registry.length} sprites, ${blank} blank frames`);
  return out;
}, registry);

report.notes.forEach((n) => console.log('note: ' + n));
report.fails.forEach((f) => console.log('FAIL: ' + f));
if (t.errors.length) { console.log('console errors:'); t.errors.forEach((e) => console.log('  ' + e)); }
console.log(report.fails.length || t.errors.length ? `\n${report.fails.length} failure(s), ${t.errors.length} console error(s)` : '\nGFX conformance: all checks passed');
await t.close();
process.exit(report.fails.length || t.errors.length ? 1 : 0);
