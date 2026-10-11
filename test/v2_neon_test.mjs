// FIZZ & POP v2 - NEON library test (role "neonlib").   node test/v2_neon_test.mjs [outDir]
//  1. static: node --check, header documents every export, loads with NO DOM (vm sandbox), no game references
//  2. page (test/v2_neon_page.html, headless Chromium): maths/colour/rng parity with U.rng, bounded caches, glyph coverage,
//     fixed-advance text, placeSprite mirroring, determinism, scale sanity, PIXEL PARITY against the mockup's own code
//     (concepts/c_abyss_glow/parts: 00_core + lwFor/placeSprite + FILM/filmGradient + eyeBall..gearPath), bloom (+ fallback),
//     Worker/OffscreenCanvas use (no `document`), zero console errors
//  3. PNGs in out/v2/neon/ (scene at k = 1, 2, 4, glyph sheet, bloom). Exit code 1 on any failed check.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const OUT = process.argv[2] || path.join(PROJECT, 'out', 'v2', 'neon');
fs.mkdirSync(OUT, { recursive: true });
const SRC = path.join(PROJECT, 'src', '09_neon.js');
const MOCK = path.join(PROJECT, 'concepts', 'c_abyss_glow', 'parts');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); if (!ok) console.log('FAIL', name, detail === undefined ? '' : detail); };

/* ---------------------------------------------------------------- 1. static */
const code = fs.readFileSync(SRC, 'utf8');
try { execFileSync(process.execPath, ['--check', SRC]); check('node --check', true); } catch (e) { check('node --check', false, e.message); }

const EXPECTED = ('TAU clamp lerp sstep hex parseColor toHex mixc rgba hot rng PAL RGB WHITE FILM makeCanvas scratch releaseScratch clearCaches stats GLOW_MAX SCRATCH_MAX ' +
  'neon body glowSprite glow dot starPath sparkle filmGradient spline poly arcPts quadPts circlePath ellipsePath sampleSpline taper spinePath lwFor placeSprite ' +
  'eyeBall brow steam heat gearPath bloom drawGrain GLYPH glyphPaths textWidth textPath drawText').split(' ');
const MANDATORY = ('neon body glow dot sparkle starPath spline poly arcPts quadPts circlePath ellipsePath sampleSpline taper spinePath filmGradient lwFor placeSprite ' +
  'rgba mixc hot hex clamp lerp sstep rng WHITE PAL').split(' ');                 // the names the lead's brief demands, verbatim
{
  let N = null;
  try {
    const sandbox = vm.createContext({});                       // no window, no document, no U, no GFX: loading must not touch any of them
    N = vm.runInContext(code + '\n;NEON', sandbox);
    check('loads without DOM/globals (vm sandbox)', !!N && typeof N.neon === 'function');
  } catch (e) { check('loads without DOM/globals (vm sandbox)', false, e.message); }
  if (N) {
    const keys = Object.keys(N);
    check('export list matches the documented one', EXPECTED.every((k) => keys.includes(k)) && keys.every((k) => EXPECTED.includes(k)), 'extra: ' + keys.filter((k) => !EXPECTED.includes(k)) + ' missing: ' + EXPECTED.filter((k) => !keys.includes(k)));
    check('mandatory names present', MANDATORY.every((k) => keys.includes(k)), MANDATORY.filter((k) => !keys.includes(k)));
    check('every export is a function/object/number', keys.every((k) => ['function', 'object', 'number'].includes(typeof N[k])));
  }
  const head = code.slice(0, code.indexOf('\nconst NEON = '));
  const undocumented = EXPECTED.filter((k) => !new RegExp('^ \\*  [^\\n]*\\b' + k + '\\b', 'm').test(head));
  check('header documents every export (signature + meaning line)', undocumented.length === 0, undocumented);
  check('no game knowledge (U./GFX/Game/C. references)', !/\bU\.|\bGFX\b|\bGame\b|\bAUDIO\b|\bLEVELS\b/.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  check('no top-level DOM access', !/^(document|window)\b/m.test(code));
  check('no network / eval / Function', !/\b(fetch|XMLHttpRequest|eval)\b|new Function|import\(/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')));
}

/* ---------------------------------------------------------------- 2. page */
const t = await launch({ html: path.join(PROJECT, 'test', 'v2_neon_page.html') });
const page = t.page;
const refCode = [
  fs.readFileSync(path.join(MOCK, '00_core.js'), 'utf8'),
  fs.readFileSync(path.join(MOCK, '20_players.js'), 'utf8').split('\n').slice(9, 21).join('\n'),     // lwFor, placeSprite
  fs.readFileSync(path.join(MOCK, '40_objects.js'), 'utf8').split('\n').slice(2, 17).join('\n'),     // FILM, filmGradient
  fs.readFileSync(path.join(MOCK, '30_enemies.js'), 'utf8').split('\n').slice(15, 70).join('\n'),    // eyeBall, brow, steam, heat, gearPath
].join('\n');

const run = async (name, fn, ...args) => {
  try { const r = await page.evaluate(fn, ...args); check(name, r === true || (r && r.ok), r && r.detail !== undefined ? r.detail : (r === true ? '' : JSON.stringify(r))); return r; }
  catch (e) { check(name, false, e.message.split('\n')[0]); return null; }
};

await run('maths + colour basics', () => {
  const { clamp, lerp, sstep, hex, mixc, rgba, hot, WHITE, RGB, PAL, toHex, parseColor } = NEON;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = [
    clamp(5, 0, 1) === 1, clamp(-5, 0, 1) === 0, clamp(0.4, 0, 1) === 0.4, lerp(10, 20, 0.25) === 12.5,
    sstep(0, 1, -1) === 0, sstep(0, 1, 2) === 1, Math.abs(sstep(0, 1, 0.5) - 0.5) < 1e-9,
    eq(hex('#3cf2ff'), [60, 242, 255]), eq(hex('#f80'), [255, 136, 0]), eq(mixc([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]),
    rgba([60, 242, 255], 0.5) === 'rgba(60,242,255,0.500)', rgba([1.4, 2.5, 3.6], 2) === 'rgba(1,3,4,1.000)', rgba([0, 0, 0], -1) === 'rgba(0,0,0,0.000)',
    rgba([9, 9, 9], NaN) === 'rgba(9,9,9,0.000)',
    eq(hot([0, 0, 0], 0), [0, 0, 0]), Math.abs(hot([0, 0, 0], 1)[0] - WHITE[0]) < 1e-9, hot([0, 0, 0])[0] === WHITE[0] * 0.7,
    eq(WHITE, [234, 255, 255]), PAL.cyan === '#3cf2ff', eq(RGB.crimson, [255, 42, 42]), eq(toHex(RGB.purple), '#bb4fd9'),
    eq(toHex([300, -4, 15.6]), '#ff0010'),
    eq(parseColor('#3cf2ff'), [60, 242, 255, 1]), eq(parseColor('#f80'), [255, 136, 0, 1]), eq(parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]),
    eq(parseColor('rgb(10 20 30 / 50%)'), [10, 20, 30, 0.5]), eq(parseColor('white'), [255, 255, 255, 1]), eq(parseColor('nonsense'), [255, 255, 255, 1]), eq(parseColor('constructor'), [255, 255, 255, 1]),
    eq(parseColor([1, 2, 3]), [1, 2, 3, 1]),
  ];
  return { ok: ok.every(Boolean), detail: ok.map((v, i) => (v ? '' : i)).filter((x) => x !== '').join(',') };
});
await run('palette is frozen (shared constants cannot be corrupted)', () => {
  const strict = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  return Object.isFrozen(NEON.RGB) && Object.isFrozen(NEON.RGB.cyan) && Object.isFrozen(NEON.PAL) && Object.isFrozen(NEON.WHITE) && Object.isFrozen(NEON.FILM)
    && strict(() => { 'use strict'; NEON.RGB.cyan[0] = 1; });
});
await run('rng: deterministic, same stream as U.rng, API complete', () => {
  for (const seed of [1, 7, 42, 99, 12345, 0xdeadbeef]) {
    const a = NEON.rng(seed), b = U.rng(seed);
    for (let i = 0; i < 40; i++) {
      const x = a.next(), y = b.next();
      if (x !== y || x < 0 || x >= 1) return { ok: false, detail: 'seed ' + seed + ' i ' + i };
    }
    const c = NEON.rng(seed), d = U.rng(seed);
    for (let i = 0; i < 20; i++) if (c.int(3, 9) !== d.int(3, 9) || c.float(2, 4) !== d.float(2, 4) || c.chance(0.3) !== d.chance(0.3) || c.pick([1, 2, 3, 4]) !== d.pick([1, 2, 3, 4])) return { ok: false, detail: 'api seed ' + seed };
  }
  const r = NEON.rng(); return r.next() === NEON.rng(1).next() && NEON.rng(NaN).next() === NEON.rng(1).next() && r.pick([]) === undefined;
});
await run('paths: spline/poly/arcPts/quadPts/sampleSpline/taper/starPath sane', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const ap = NEON.arcPts(5, 5, 2, 3, 0, 180, 4), qp = NEON.quadPts([0, 0], [5, 10], [10, 0], 4), sp = NEON.sampleSpline([[0, 0], [5, 5], [10, 0]], 4);
  const rb = NEON.taper(sp, () => 1);
  const ok = [
    ap.length === 5, near(ap[0][0], 7) && near(ap[0][1], 5), near(ap[4][0], 3) && near(ap[4][1], 5),
    qp.length === 5, near(qp[2][0], 5) && near(qp[2][1], 5), sp.length === 9, near(sp[8][0], 10),
    rb instanceof Path2D, NEON.starPath(0, 0, 4) instanceof Path2D, NEON.spline([[0, 0]]) instanceof Path2D, NEON.poly([]) instanceof Path2D,
    NEON.sampleSpline([]).length === 0, NEON.taper([], () => 1) instanceof Path2D,
    NEON.circlePath(1, 1, 1) instanceof Path2D, NEON.ellipsePath(1, 1, 2, 1, 0.5) instanceof Path2D, NEON.spinePath(sp) instanceof Path2D, NEON.gearPath(0, 0, 5, 4, 8, 0) instanceof Path2D,
  ];
  return { ok: ok.every(Boolean), detail: ok.map((v, i) => (v ? '' : i)).filter((x) => x !== '').join(',') };
});
await run('lwFor: elegant 1..2.7 px strokes from k=1 to k=8, monotone', () => {
  let prev = 0; const px = [];
  for (const k of [1, 1.5, 2, 3, 4, 4.8, 6, 8]) { const v = NEON.lwFor(k) * k; px.push(+v.toFixed(2)); if (!(v > prev && v >= 0.95 && v <= 2.8)) return { ok: false, detail: px }; prev = v; }
  return { ok: Math.abs(NEON.lwFor(4.8) - 2.1 / 4.8) < 1e-9 && Math.abs(NEON.lwFor(4.8, 2) - 4.2 / 4.8) < 1e-9, detail: px.join(' ') };
});
await run('glyph coverage: every SPEC glyph, bounded strokes, aliases, fallback', () => {
  const spec = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,:;-+=&'\"/()%*#<>_©♥★←→";
  const q = NEON.GLYPH['?'], miss = [], bad = [];
  for (const ch of spec) {
    const g = NEON.glyphPaths(ch);
    if (ch !== '?' && g === q) miss.push(ch);
    for (let i = 1; i < g.length; i++) for (const [x, y] of g[i]) if (!(x >= -0.1 && x <= g[0] + 0.1 + (g[0] === 0 ? 0.0 : 0) && y >= -0.08 && y <= 1.16)) bad.push(ch + ':' + x.toFixed(2) + ',' + y.toFixed(2));
  }
  const lower = NEON.glyphPaths('a') === NEON.glyphPaths('A') && NEON.glyphPaths('’') === NEON.glyphPaths("'") && NEON.glyphPaths('€') === q && NEON.glyphPaths(undefined) === q && NEON.glyphPaths('ab') === q;
  return { ok: !miss.length && !bad.length && lower, detail: 'missing=' + miss.join('') + ' outOfBounds=' + bad.join(' ') + ' lower/alias/fallback=' + lower };
});
await run('text: width maths, fixed advance (true monospace), alignment', () => {
  const tw = NEON.textWidth;
  const adv = 8 / 5, cap = 5;
  const c = document.createElement('canvas'); c.width = 400; c.height = 60; const g = c.getContext('2d');
  const ret = NEON.drawText(g, 'WIWI', 200, 20, cap, { align: 'center', adv, col: NEON.RGB.white });
  const ret2 = NEON.drawText(g, 'IIII', 200, 20, cap, { align: 'right', adv });
  const ok = [
    tw('') === 0, Math.abs(tw('HI') - (0.62 + 0.46 + 0 )) < 1e-9, tw('HI', 0.46, true) > tw('HI', 0.46), tw('WIWI', 0.3, false, adv) === tw('IIII', 0.9, true, adv) && tw('WIWI', 0.3, false, adv) === 4 * adv,
    ret === 4 * adv * cap && ret2 === ret, NEON.textPath('HI', 0, 0, 5) instanceof Path2D,
  ];
  // centred fixed-advance text of symmetric content: pixel bbox centre == requested x
  const k = 4, c2 = document.createElement('canvas'); c2.width = 160 * k; c2.height = 30 * k; const g2 = c2.getContext('2d'); g2.setTransform(k, 0, 0, k, 0, 0);
  NEON.drawText(g2, 'HIH', 80, 10, 8, { align: 'center', adv: 1.3, halo: 0, hot: 0, lw: 0.6 });
  const d = g2.getImageData(0, 0, c2.width, c2.height).data; let x0 = 1e9, x1 = -1;
  for (let y = 0; y < c2.height; y++) for (let x = 0; x < c2.width; x++) if (d[(y * c2.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const centre = (x0 + x1 + 1) / 2 / k;
  ok.push(Math.abs(centre - 80) < 0.35);
  return { ok: ok.every(Boolean), detail: ok.map((v, i) => (v ? '' : i)).filter((x) => x !== '').join(',') + ' bboxCentre=' + centre.toFixed(2) };
});
await run('caches are bounded (glow LRU, scratch, grain) and clearCaches frees them', () => {
  NEON.clearCaches();
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  const keep = [200, 40, 120];
  const keepSprite = NEON.glowSprite(keep);
  const R = NEON.rng(3);
  for (let i = 0; i < 4000; i++) { NEON.glow(g, 32, 32, 10, [R.int(0, 255), R.int(0, 255), R.int(0, 255)], 0.5); if (i % 50 === 0) NEON.glow(g, 32, 32, 10, keep, 0.5); }
  const s1 = NEON.stats();
  const sameKept = NEON.glowSprite(keep) === keepSprite;           // touched regularly -> never evicted
  for (let i = 0; i < 200; i++) NEON.scratch('u' + i, 8 + (i % 5), 8);
  for (let i = 0; i < 60; i++) NEON.drawGrain(g, 8, 8, i / 100);
  const s2 = NEON.stats();
  const same = NEON.scratch('keepme', 33, 17); const same2 = NEON.scratch('keepme', 33, 17);
  const resized = NEON.scratch('keepme', 20, 20);
  const scratchOk = same === same2 && same.width === 20 && resized === same;       // (before clearCaches, which shrinks released canvases to 1x1)
  NEON.clearCaches(); const s3 = NEON.stats();
  const ok = [s1.glow <= NEON.GLOW_MAX, sameKept, s2.scratch <= NEON.SCRATCH_MAX, s2.grain <= 4, scratchOk, s3.glow === 0 && s3.scratch === 0 && s3.grain === 0,
    NEON.glowSprite([1, 2, 3]).width === 128, NEON.glowSprite([300, -5, 7.5]).width === 128];
  return { ok: ok.every(Boolean), detail: JSON.stringify(s1) + ' ' + JSON.stringify(s2) + ' ' + ok.map((v, i) => (v ? '' : i)).filter((x) => x !== '').join(',') };
});
await run('makeCanvas + OffscreenCanvas/Worker path (no document)', async () => {
  const cv = NEON.makeCanvas(7, 5);
  if (!(cv instanceof HTMLCanvasElement) || cv.width !== 7 || cv.height !== 5) return { ok: false, detail: 'makeCanvas' };
  return true;
});
// worker: the library must run where `document` does not exist (OffscreenCanvas fallback)
{
  const r = await page.evaluate(async (src) => {
    try {
      const wcode = src + `\nself.onmessage = () => { const c = new OffscreenCanvas(64, 64), g = c.getContext('2d'); NEON.neon(g, NEON.circlePath(32, 32, 20), NEON.RGB.cyan, 3); NEON.glow(g, 32, 32, 20, NEON.RGB.magenta, 0.6); NEON.drawText(g, 'OK', 8, 8, 10, {}); NEON.bloom(g, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; self.postMessage({ s, hasDoc: typeof document !== 'undefined', stats: NEON.stats() }); };`;
      const w = new Worker(URL.createObjectURL(new Blob([wcode], { type: 'text/javascript' })));
      return await new Promise((res) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => res({ err: String(e.message || e) }); setTimeout(() => res({ err: 'timeout' }), 8000); w.postMessage(1); });
    } catch (e) { return { err: String(e.message || e) }; }
  }, code);
  check('Worker (no document): neon/glow/text/bloom run on OffscreenCanvas', r && !r.err && r.s > 1000 && r.hasDoc === false, JSON.stringify(r));
}
await run('filmGradient / FILM', () => {
  const g = document.createElement('canvas').getContext('2d');
  const a = NEON.filmGradient(g, 5, 5, 0.3, 0.5), b = NEON.filmGradient(g, 5, 5, 0.3, 0.5, [NEON.RGB.amber, NEON.RGB.cyan]);
  return a && b && NEON.FILM.length === 5 && NEON.FILM[0] === NEON.RGB.cyan && NEON.FILM[4] === NEON.RGB.cyan;
});

/* --- pixel helpers + parity against the mockup's own code --- */
await page.evaluate((src) => {
  window.REF = T.loadRef(src);
  window.px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  window.diff = (A, B) => { const a = px(A), b = px(B); let max = 0, sum = 0, n = 0; if (a.length !== b.length) return { max: 1e9, mean: 1e9 }; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; sum += d; n++; } return { max, mean: sum / n }; };
}, refCode);
for (const k of [1, 2, 4]) {
  const r = await page.evaluate((k) => {
    const d = diff(T.scene(k, NEON, { parity: true }), T.scene(k, REF, { parity: true }));
    return d;
  }, k);
  check('PIXEL PARITY with the mockup core (neon/body/glow/dot/sparkle/taper/spline/film/eye/steam/gear/text/placeSprite) k=' + k, r.max === 0, JSON.stringify(r));
}
for (const [k, o] of [[2, undefined], [4, undefined], [4, { gain: 1.25 }]]) {
  const r = await page.evaluate(({ k, o }) => diff(T.bloomed(k, o, NEON, { parity: true }), T.bloomed(k, o, REF, { parity: true })), { k, o });
  check('PIXEL PARITY bloom() vs mockup, k=' + k + (o ? ' gain' : ''), r.max === 0, JSON.stringify(r));
}
{
  const r = await page.evaluate(() => {
    const rgbaRef = REF.rgba, bad = [];
    for (const c of [[0, 0, 0], [60, 242, 255], [255, 255, 255], [12.3, 45.6, 78.9]]) for (const a of [0, 0.3, 0.999, 1, 1.5, -0.2]) if (NEON.rgba(c, a) !== rgbaRef(c, a)) bad.push(c + '/' + a);
    const sa = NEON.sampleSpline([[0, 0], [3, 4], [9, 2], [12, 8]], 6), sb = REF.sampleSpline([[0, 0], [3, 4], [9, 2], [12, 8]], 6);
    const ta = NEON.taper(sa, (u) => 1 + u), tb = REF.taper(sb, (u) => 1 + u);
    const ra = NEON.rng(77), rb = REF.rng(77); let rngOk = true; for (let i = 0; i < 30; i++) if (ra.next() !== rb.next()) rngOk = false;
    const gl = Object.keys(REF.GLYPH).filter((k) => JSON.stringify(REF.GLYPH[k]) !== JSON.stringify(NEON.GLYPH[k]));
    const widths = ['FIZZ & POP', '0123', 'WIN!?'].every((s) => NEON.textWidth(s, 0.46) === REF.textWidth(s, 0.46));
    return { ok: !bad.length && JSON.stringify(sa) === JSON.stringify(sb) && rngOk && !gl.length && widths && NEON.lwFor(5.9) === REF.lwFor(5.9), detail: 'rgbaBad=' + bad + ' glyphDiff=' + gl + ' rngOk=' + rngOk };
  });
  check('value parity with the mockup (rgba, sampleSpline, rng, every mockup glyph, textWidth, lwFor)', r.ok, r.detail);
}
await run('bloom: fallback blur (no ctx.filter) + quality-1 shift stay close to the full bloom', () => {
  const full = T.bloomed(4, undefined), fb = T.bloomed(4, { noFilter: true }), sh3 = T.bloomed(4, { shift: 3 }), plain = T.scene(4);
  const lum = (c) => { const d = px(c); let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
  const lf = lum(full), lb = lum(fb), l3 = lum(sh3), l0 = lum(plain);
  const d1 = diff(full, fb), d2 = diff(full, sh3);
  const ok = [lf > l0 * 1.02, Math.abs(lb - lf) / lf < 0.15, Math.abs(l3 - lf) / lf < 0.22, d1.mean < 6, d2.mean < 8];
  return { ok: ok.every(Boolean), detail: `lum plain/full/fallback/shift3 = ${l0.toFixed(2)}/${lf.toFixed(2)}/${lb.toFixed(2)}/${l3.toFixed(2)} meanDiff fallback ${d1.mean.toFixed(2)} shift3 ${d2.mean.toFixed(2)} ` + ok.map((v, i) => (v ? '' : i)).filter((x) => x !== '').join(',') };
});
await run('bloom: tiny canvases do not throw', () => {
  for (const [w, h] of [[2, 2], [8, 5], [16, 16], [33, 7]]) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); NEON.bloom(g, w, h); NEON.bloom(g, w, h, { shift: 4 }); }
  return true;
});
await run('placeSprite: face -1 mirrors the sprite inside its box; alpha applies; transform restored', () => {
  const k = 4, mk = () => { const c = document.createElement('canvas'); c.width = 16 * k; c.height = 16 * k; return c; };
  const draw = (face, a) => {
    const c = mk(), g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
    const before = g.getTransform();
    NEON.placeSprite(g, { x: 0, y: 0, k, face, a }, 16, () => { NEON.neon(g, NEON.poly([[2, 14], [2, 4], [12, 4], [15, 8], [12, 12]], true), NEON.RGB.cyan, NEON.lwFor(k)); NEON.dot(g, 12, 8, 0.9, NEON.WHITE); });
    const after = g.getTransform();
    return { c, restored: before.a === after.a && before.e === after.e && before.d === after.d };
  };
  const A = draw(1), B = draw(-1), H = draw(1, 0.5);
  const a = px(A.c), b = px(B.c), W = A.c.width; let maxd = 0, sumd = 0, nbig = 0, sumA = 0, sumH = 0; const h = px(H.c);
  for (let y = 0; y < A.c.height; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 4; ch++) { const d = Math.abs(a[(y * W + x) * 4 + ch] - b[(y * W + (W - 1 - x)) * 4 + ch]); if (d > maxd) maxd = d; sumd += d; if (d > 64) nbig++; }
  for (let i = 3; i < a.length; i += 4) { sumA += a[i]; sumH += h[i]; }     // alpha channel (readback colour is un-premultiplied)
  const meand = sumd / a.length;     // Skia's AA is not exactly mirror-symmetric on pixel-aligned edges: judge the mean + the count of big deviations
  return { ok: meand < 1.5 && nbig < a.length * 0.004 && A.restored && B.restored && sumH < sumA * 0.7 && sumH > sumA * 0.3, detail: `mirror meandiff ${meand.toFixed(2)} big(>64) ${nbig}/${a.length} max ${maxd} alphaRatio ${(sumH / sumA).toFixed(2)}` };
});
await run('every drawing call leaves ctx state (transform, alpha, composite, styles) untouched', () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.setTransform(2, 0, 0, 2, 3, 4); g.globalAlpha = 0.77; g.globalCompositeOperation = 'multiply'; g.strokeStyle = '#123456'; g.fillStyle = '#654321'; g.lineWidth = 3.3; g.lineCap = 'butt';
  const snap = () => JSON.stringify([g.getTransform().a, g.getTransform().e, g.getTransform().f, g.globalAlpha, g.globalCompositeOperation, g.strokeStyle, g.fillStyle, g.lineWidth, g.lineCap, g.imageSmoothingEnabled]);
  const s0 = snap(), p = NEON.circlePath(10, 10, 6), bad = [];
  const calls = {
    neon: () => NEON.neon(g, p, NEON.RGB.cyan, 1), neonGrad: () => NEON.neon(g, p, NEON.RGB.cyan, 1, { grad: [0, 0, 10, 10] }),
    body: () => NEON.body(g, p, NEON.RGB.amber, 1, { hl: [5, 5, 5, 0.4], core: [8, 8, 5, 0.5] }), glow: () => NEON.glow(g, 10, 10, 8, NEON.RGB.lime, 1.4, 0.5),
    dot: () => NEON.dot(g, 10, 10, 2, NEON.RGB.cyan), sparkle: () => NEON.sparkle(g, 10, 10, 3, NEON.RGB.magenta, 1, 0.4), eye: () => NEON.eyeBall(g, 10, 10, 2, NEON.RGB.amber, [0, 0]),
    brow: () => NEON.brow(g, 10, 10, 2, 1, 0.3, NEON.RGB.crimson), steam: () => NEON.steam(g, 10, 20, 0.3, 0.3, NEON.RGB.crimson), heat: () => NEON.heat(g, 1, NEON.RGB.crimson, 10, 10, 8),
    text: () => NEON.drawText(g, 'AB1', 2, 2, 6, { align: 'center', adv: 1.2 }), grain: () => NEON.drawGrain(g, 8, 8, 0.05),
    place: () => NEON.placeSprite(g, { x: 5, y: 5, k: 2, face: -1, a: 0.4 }, 16, () => NEON.neon(g, p, NEON.RGB.cyan, 1)),
  };
  for (const [n, f] of Object.entries(calls)) { f(); if (snap() !== s0) bad.push(n); }
  return { ok: !bad.length, detail: bad.join(',') };
});
await run('determinism: the same scene twice is pixel-identical', () => diff(T.scene(2), T.scene(2)).max === 0);
await run('scale sanity: k=1/2/4 renders carry comparable light and every scale shows detail', () => {
  const lum = (c) => { const d = px(c); let s = 0, lit = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; s += v; if (v > 90) lit++; } return { mean: s / (d.length / 4), lit: lit / (d.length / 4) }; };
  const a = lum(T.scene(1)), b = lum(T.scene(2)), c = lum(T.scene(4));
  const ok = [b.mean / a.mean > 0.55 && b.mean / a.mean < 1.8, c.mean / b.mean > 0.55 && c.mean / b.mean < 1.8, a.lit > 0.01 && a.lit < 0.35, c.lit > 0.01 && c.lit < 0.35];
  return { ok: ok.every(Boolean), detail: `mean ${a.mean.toFixed(2)}/${b.mean.toFixed(2)}/${c.mean.toFixed(2)} lit ${a.lit.toFixed(3)}/${b.lit.toFixed(3)}/${c.lit.toFixed(3)}` };
});

/* --- timings (informational + a loose gate: baking must stay cheap) --- */
const perf = await page.evaluate(() => {
  const time = (f, n) => { f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
  const c = document.createElement('canvas'); c.width = 640; c.height = 256; const g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0);
  const p = NEON.circlePath(20, 20, 8);
  return {
    scene_k4_ms: +time(() => T.scene(4), 8).toFixed(2), neon_us: +(time(() => NEON.neon(g, p, NEON.RGB.cyan, 0.5), 400) * 1000).toFixed(1),
    glow_us: +(time(() => NEON.glow(g, 30, 30, 10, NEON.RGB.magenta, 0.8), 800) * 1000).toFixed(1), body_us: +(time(() => NEON.body(g, p, NEON.RGB.amber, 0.5, { hl: [18, 18, 6, 0.4] }), 200) * 1000).toFixed(1),
    bloom_k4_ms: +time(() => NEON.bloom(g, 640, 256), 6).toFixed(2), text_us: +(time(() => NEON.drawText(g, 'FIZZ & POP 012300', 4, 4, 6, {}), 100) * 1000).toFixed(1),
  };
});
check('perf: one 640x256 scene < 60 ms, neon < 1 ms, glow < 0.3 ms (software raster)', perf.scene_k4_ms < 60 && perf.neon_us < 1000 && perf.glow_us < 300, JSON.stringify(perf));
console.log('perf', JSON.stringify(perf));

/* ---------------------------------------------------------------- 3. pictures */
const shots = [
  ['scene_k1_x4.png', () => T.scene(1), 4], ['scene_k2_x2.png', () => T.scene(2), 2], ['scene_k4.png', () => T.scene(4), 1],
  ['glyphs_k6.png', () => T.glyphs(6), 1], ['bloom_k4.png', () => T.bloomed(4), 1], ['bloom_k4_nofilter.png', () => T.bloomed(4, { noFilter: true }), 1],
  ['bloom_k2_shift3_x2.png', () => T.bloomed(2, { shift: 3 }), 2],
];
for (const [file, fn, scale] of shots) await canvasFnShot(page, path.join(OUT, file), fn, { scale });
for (const [file] of shots) check('png written + not blank: ' + file, fs.statSync(path.join(OUT, file)).size > 4000, fs.statSync(path.join(OUT, file)).size);
check('zero console errors', t.errors.length === 0, t.errors.join(' | '));
await t.close();

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ perf, results }, null, 1));
console.log(results.map((r) => (r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.detail && (!r.ok || r.detail.length < 160) ? '  [' + r.detail + ']' : '')).join('\n'));
console.log(`\nv2_neon_test: ${results.length - failed.length}/${results.length} passed, PNGs in ${OUT}`);
process.exit(failed.length ? 1 : 0);
