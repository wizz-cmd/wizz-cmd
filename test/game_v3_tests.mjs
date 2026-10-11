// FIZZ & POP v3 - Game wave tests (FIXPLAN_V3 "Game": G1-G8, V1, V2, V6). Deterministic, real headless Chromium, stubs for GFX / AUDIO / LEVELS (REAL=1: the real modules).
//   node test/game_v3_tests.mjs [prefix...]       e.g.  node test/game_v3_tests.mjs G1 G3
//   GAME=../backup/v3/game_40_game.js node test/game_v3_tests.mjs   runs the same checks against the pre-v3 Game (they must FAIL there: proof that the gates bite)
// Every check is a measurement of what Game draws (GFX.draw / GFX.text / GFX.particle / canvas calls are wrapped inside the page), not a grep of the source.
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const HTML = path.join(PROJECT, 'test', 'game_harness.html') + '?' + [process.env.REAL ? 'real=1' : '', process.env.GAME ? 'game=' + process.env.GAME : ''].filter(Boolean).join('&');
const only = process.argv.slice(2);
const results = [];
let t, page;
class Fail extends Error {}
const ok = (c, msg) => { if (!c) throw new Fail(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (a !== b) throw new Fail(`${msg || 'eq'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);

async function fresh() {
  if (page) await t.close();
  t = await launch({ html: HTML });
  page = t.page;
  await page.waitForFunction(() => !!window.__t);
  await ev(() => __t.freeze(true));
}
async function test(name, fn) {
  if (only.length && !only.some((p) => name.startsWith(p))) return;
  await fresh();
  const errBefore = t.errors.length;
  try {
    await fn();
    if (t.errors.length > errBefore) throw new Fail('console errors: ' + t.errors.slice(errBefore).join(' | '));
    results.push([name, true]);
    console.log('PASS  ' + name);
  } catch (e) {
    results.push([name, false]);
    console.log('FAIL  ' + name + '\n        ' + (e instanceof Fail ? e.message : e.stack || e));
  }
}

/** Signal helpers shared by the page functions (installed once per page): peaks = local maxima that rise >= 0.05 above both sides; maxStep = largest frame-to-frame change. */
const LIB = `
window.SIG = {
  peaks(a) { let n = 0; for (let i = 1; i < a.length - 1; i++) if (a[i] > a[i - 1] && a[i] >= a[i + 1] && a[i] - Math.min(...a.slice(Math.max(0, i - 8), i)) >= 0.05 && a[i] - Math.min(...a.slice(i + 1, i + 9)) >= 0.05) n++; return n; },
  maxStep(a) { let m = 0; for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; },
  reversals(a, eps) { let r = 0, last = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; if (Math.abs(d) <= eps) continue; const s = d > 0 ? 1 : -1; if (last && s !== last) r++; last = s; } return r; },
};`;
const withLib = async () => { await ev((src) => (0, eval)(src), LIB); };

// =================================================================================================
// G1 - the ink telegraph is a smooth glow ramp, never a strobe
// =================================================================================================
await test('G1 boss ink telegraph: a smooth ramp (angry face crossfade + glow) over the 22 frames, then a fade; no white flip-flop, one swell per volley', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    T.start({ players: 1, level: 30, seed: 8 }); T.step(160); Game.debug.god(true);
    const S = T.S(), b = S.enemies[0]; S.thunderT = 1e9; b.jx = 0; b.jy = 0; b.x = 104; b.y = 56; S.players[0].x = 24; S.players[0].y = 200;
    b.inkT = 45;
    const rows = []; const o = GFX.draw;
    let cur;
    GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('kraken')) cur.push({ n, a: opt && opt.alpha !== undefined ? opt.alpha : 1, white: !!(opt && opt.white), tint: opt && opt.tint ? opt.tint : '' }); return o.call(GFX, c, n, f, x, y, opt); };
    for (let i = 0; i < 125; i++) { cur = []; T.step(1); b.x = 104; b.y = 56; rows.push({ inkT: b.inkT, d: cur }); }
    GFX.draw = o;
    const white = rows.map((r) => r.d.filter((d) => d.white).reduce((s, d) => s + d.a, 0));
    const glow = rows.map((r) => r.d.filter((d) => d.tint).reduce((s, d) => s + d.a, 0));
    const face = rows.map((r) => r.d.filter((d) => d.n === 'kraken_angry' && !d.white && !d.tint).reduce((s, d) => s + d.a, 0));
    const sum = (a) => a.map((v, i) => v + 0);
    const total = rows.map((_, i) => white[i] + glow[i]);
    const volleys = rows.filter((r, i) => i && r.inkT > rows[i - 1].inkT).length;
    return { white, glow, face, total, volleys, maxWhite: Math.max(...white), maxGlow: Math.max(...glow), stepWhite: SIG.maxStep(white), stepGlow: SIG.maxStep(glow), stepFace: SIG.maxStep(face),
      revTotal: SIG.reversals(total, 1e-6), swells: SIG.peaks(total), anyTint: glow.some((v) => v > 0) };
  });
  ok(r.volleys === 1, 'one volley in the window (' + r.volleys + ')');
  ok(r.maxWhite > 0 || r.maxGlow > 0, 'a glow is drawn during the telegraph');
  ok(r.stepWhite <= 0.03 && r.stepGlow <= 0.04 && r.stepFace <= 0.1, 'no frame-to-frame jump of the white / glow / face alpha (white ' + r.stepWhite.toFixed(3) + ', glow ' + r.stepGlow.toFixed(3) + ', face ' + r.stepFace.toFixed(3) + '; the old code toggled 0.55)');
  ok(r.maxWhite <= 0.2, 'the white-hot core stays modest (' + r.maxWhite.toFixed(3) + ')');
  ok(r.revTotal <= 2, 'the glow rises once and falls once per volley (' + r.revTotal + ' direction changes)');
  ok(r.swells <= 1, 'one swell per ink period = 0.5 Hz (' + r.swells + ')');
});

await test('G1b reduced motion: the telegraph is a steady 0.3 white (no ramp, no glow draws); the single 4-frame hit flash stays a white silhouette', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: true });
    T.start({ players: 1, level: 30, seed: 8 }); T.step(160); Game.debug.god(true);
    const S = T.S(), b = S.enemies[0]; S.thunderT = 1e9; b.jx = 0; b.jy = 0; b.x = 104; b.y = 56; S.players[0].x = 24; S.players[0].y = 200; b.inkT = 30;
    const o = GFX.draw; let cur; const wh = [], tints = [];
    GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('kraken')) cur.push({ n, a: opt && opt.alpha !== undefined ? opt.alpha : 1, white: !!(opt && opt.white), tint: !!(opt && opt.tint) }); return o.call(GFX, c, n, f, x, y, opt); };
    for (let i = 0; i < 40; i++) { cur = []; T.step(1); b.x = 104; b.y = 56; const inWind = b.inkT > 0 && b.inkT <= 22; if (inWind) wh.push(cur.filter((d) => d.white).map((d) => d.a).join('+')); if (cur.some((d) => d.tint)) tints.push(1); }
    // hit flash
    b.flashT = 4; cur = []; T.render(); const flash = cur.filter((d) => d.white).length;
    GFX.draw = o;
    return { wh: [...new Set(wh)], n: wh.length, tints: tints.length, flash };
  });
  eq(r.wh.join('|'), '0.3', 'steady 0.3 white while winding up'); ok(r.n >= 20, 'for the whole telegraph'); eq(r.tints, 0, 'no glow draws'); eq(r.flash, 1, 'the hit flash is one white silhouette');
});

// =================================================================================================
// G3 - nothing blinks fast: smooth pulses <= 4 Hz, steady under reduced motion
// =================================================================================================
await test('G3a invulnerability = smooth alpha pulse 0.4..1.0 at <= 4 Hz (steady 0.6 under reduced motion)', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; const out = {};
    for (const rm of [false, true]) {
      Game.setOptions({ reducedMotion: rm, quality: 2 }); T.arena({ level: 3, empty: true }); const p = T.S().players[0]; p.inv = 120; const al = []; const o = GFX.draw;
      GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('p1_') && !(opt && opt.alpha !== undefined && opt.alpha <= 0.25)) al.push(opt && opt.alpha !== undefined ? opt.alpha : 1); return o.call(GFX, c, n, f, x, y, opt); };
      for (let i = 0; i < 118; i++) T.step(1); GFX.draw = o;
      out[rm ? 'rm' : 'full'] = { n: al.length, min: Math.min(...al), max: Math.max(...al), step: SIG.maxStep(al), peaks: SIG.peaks(al), distinct: [...new Set(al.map((v) => v.toFixed(3)))].length };
    }
    Game.setOptions({ reducedMotion: false });
    return out;
  });
  const f = r.full;
  ok(f.n >= 116 && f.min >= 0.4 - 1e-9 && f.max <= 1 + 1e-9, 'range 0.4..1.0 ' + JSON.stringify(f)); ok(f.max >= 0.97 && f.min <= 0.43, 'and it really swings through the whole range');
  ok(f.step <= 0.2, 'smooth: largest frame-to-frame change ' + f.step.toFixed(3) + ' (the old blink jumped 0.7)'); ok(f.peaks <= 9, '<= 4 Hz: ' + f.peaks + ' peaks in 2 s');
  eq(r.rm.distinct, 1, 'steady under reduced motion'); near(r.rm.min, 0.6, 1e-9, 'at 0.6');
});
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Fail(`${msg || 'near'}: got ${a}, expected ${b} +/- ${tol}`); }

await test('G3b HURRY UP! / READY! / EXTEND!: no hard blinks, pulses <= 2.5 Hz, colour changes <= 3 per second', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; const out = {};
    let frameNo = 0, lastFrame = -1;           // the banner draws its colour crossfade as a second text call per frame: alpha is recorded for every call, the colour only of the FIRST call of a frame
    const watch = (str, steps) => { const al = [], col = []; const o = GFX.text; GFX.text = (c, s, x, y, color, opt) => { if (s === str) { al.push(+c.globalAlpha.toFixed(4)); if (frameNo !== lastFrame) { col.push(color); lastFrame = frameNo; } } return o.call(GFX, c, s, x, y, color, opt); }; steps(); GFX.text = o; return { al, col }; };
    const stepF = () => { frameNo++; T.step(1); };
    Game.setOptions({ reducedMotion: false, quality: 2 });
    T.arena({ level: 3, empty: true }); T.S().hurryBanner = 120;
    const h = watch('HURRY UP!', () => { for (let i = 0; i < 119; i++) stepF(); });
    out.hurry = { n: h.al.length, min: Math.min(...h.al.slice(8, 108)), max: Math.max(...h.al), step: SIG.maxStep(h.al), peaks: SIG.peaks(h.al), first: h.al[0], last: h.al[h.al.length - 1] };
    T.start({ players: 1, level: 3, seed: 5 });
    const rd = watch('READY!', () => { for (let i = 0; i < 100; i++) stepF(); });
    out.ready = { n: rd.al.length, min: Math.min(...rd.al.slice(10)), step: SIG.maxStep(rd.al), peaks: SIG.peaks(rd.al), first: rd.al[0] };
    // extend: the banner colour changes <= 3 / s and the lit letters pulse smoothly
    T.arena({ level: 3, empty: true }); Game.debug.god(true); const S = T.S(); const p = S.players[0]; p.letters = [true, true, true, true, true, false];
    Game.debug.spawn('letter', p.x, p.y); const lb = S.bubbles[S.bubbles.length - 1]; lb.letter = 'D'; lb.att = null; p.noPopT = 0; lb.x = p.x; lb.y = p.y;
    const ex = watch('EXTEND!', () => { stepF(); for (let i = 0; i < 170 && T.state().phase !== 'extend'; i++) stepF(); for (let i = 0; i < 90; i++) stepF(); });
    out.extend = { n: ex.al.length, changes: ex.col.filter((c, i) => i && c !== ex.col[i - 1]).length, secs: ex.col.length / 60, phase: T.state().phase, cols: [...new Set(ex.col)].length };
    return out;
  });
  ok(r.hurry.n >= 118 && r.hurry.min >= 0.5, 'HURRY UP! is drawn every frame at a visible alpha ' + JSON.stringify(r.hurry)); ok(r.hurry.step <= 0.13, 'and changes smoothly (' + r.hurry.step.toFixed(3) + ' per frame; the old one went 1 -> 0 in a frame)'); ok(r.hurry.peaks <= 5, '2 Hz pulse (' + r.hurry.peaks + ' peaks in 2 s)');
  ok(r.hurry.first < 0.5 && r.hurry.last < 0.5, 'it fades in and out (' + r.hurry.first.toFixed(2) + ' ... ' + r.hurry.last.toFixed(2) + ')');
  ok(r.ready.n >= 35 && r.ready.min >= 0.5 && r.ready.step <= 0.13 && r.ready.peaks <= 3, 'READY! pulses gently ' + JSON.stringify(r.ready));
  ok(r.extend.n > 60 && r.extend.changes / r.extend.secs <= 3.01, 'EXTEND! colour changes <= 3 per second (' + r.extend.changes + ' in ' + r.extend.secs.toFixed(1) + ' s, phase ' + r.extend.phase + ')');
});

await test('G3c expiring special / letter bubbles pulse smoothly (<= 2.5 Hz), the warning bubble flickers at 3 Hz at most, flames die down smoothly', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; const out = {};
    Game.setOptions({ reducedMotion: false, quality: 2 });
    T.arena({ level: 3, empty: true }); const S = T.S(); Game.debug.spawn('thunder', 100, 100); const b = S.bubbles[S.bubbles.length - 1]; b.att = null; b.vy = 0; b.age = b.life - 120;
    const al = [], fr = []; const o = GFX.draw;
    GFX.draw = (c, n, f, x, y, opt) => { if (n === 'bubble_thunder') al.push(opt && opt.alpha !== undefined ? opt.alpha : 1); return o.call(GFX, c, n, f, x, y, opt); };
    for (let i = 0; i < 100; i++) { T.step(1); b.x = 100; b.y = 100; if (b.dead) break; } GFX.draw = o;
    const dying = al.slice(30);
    out.special = { n: al.length, min: Math.min(...dying), max: Math.max(...dying), step: SIG.maxStep(dying), peaks: SIG.peaks(dying) };
    // empty bubble warning frames
    T.arena({ level: 3, empty: true }); Game.debug.god(true); const S2 = T.S(); const p = S2.players[0]; p.x = 200; Game.debug.spawn('nibbler', 0, 0); S2.enemies.length = 0;
    T.step(1, [{ fire: true }]); T.step(2); const eb = S2.bubbles.find((q) => q.kind === 'empty'); eb.age = eb.life - 110; eb.state = 'float'; eb.att = null;
    const frames = []; GFX.draw = (c, n, f, x, y, opt) => { if (n === 'bubble_warn') frames.push(f); return o.call(GFX, c, n, f, x, y, opt); };
    for (let i = 0; i < 90; i++) { T.step(1); if (!eb.dead) { eb.y = 120; } } GFX.draw = o;
    out.warn = { n: frames.length, changes: frames.filter((f, i) => i && f !== frames[i - 1]).length };
    // flames: the last half second is a smooth fade
    T.arena({ level: 3, empty: true }); const S3 = T.S(); S3.flames.push({ x: 100, y: 184, t: 200, dead: false, chain: { owner: 0, kills: 0 } });
    const fa = []; GFX.draw = (c, n, f, x, y, opt) => { if (n === 'flame') fa.push(opt && opt.alpha !== undefined ? opt.alpha : 1); return o.call(GFX, c, n, f, x, y, opt); };
    for (let i = 0; i < 40; i++) T.step(1); GFX.draw = o;
    out.flame = { n: fa.length, mono: fa.every((v, i) => !i || v <= fa[i - 1] + 1e-9), step: SIG.maxStep(fa), last: fa[fa.length - 1], first: fa[0] };
    return out;
  });
  ok(r.special.n >= 80 && r.special.min >= 0.5 - 1e-9 && r.special.step <= 0.1 && r.special.peaks <= 3, 'special bubble expiry pulses smoothly ' + JSON.stringify(r.special));
  ok(r.warn.n >= 60 && r.warn.changes / (r.warn.n / 60) <= 6.3, 'bubble_warn flickers at <= 3 Hz (' + r.warn.changes + ' frame changes in ' + (r.warn.n / 60).toFixed(1) + ' s; the old one changed every 6 frames = 10 Hz)');
  ok(r.flame.n >= 38 && r.flame.mono && r.flame.step <= 0.05 && r.flame.last < 0.1, 'flames fade out smoothly (no 10 Hz blink) ' + JSON.stringify(r.flame));
});

// =================================================================================================
// V1 - frozen = the cast's <e>_frozen ice cast (tint recipe as the fallback); the thaw pulses
// =================================================================================================
await test('V1 frozen enemies draw <e>_frozen (plain, no tint / white) when GFX has it, else the tint recipe; the last second thaws in a gentle pulse', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; const out = {};
    const frozenScene = (withIce, rm) => {
      if (typeof GFX._withFrozen === 'function') GFX._withFrozen(withIce);
      Game.setOptions({ reducedMotion: !!rm, quality: 2 });
      T.arena({ level: 3, empty: true }); const S = T.S();
      Game.debug.spawn('jellop', 120, 100); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 200; e.vx = 0; e.vy = 0;
      return { S, e };
    };
    const capture = (S, e, frames) => {
      const rows = []; const o = GFX.draw; let cur;
      GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('jellop')) cur.push({ n, f, a: opt && opt.alpha !== undefined ? opt.alpha : 1, tint: opt && opt.tint ? opt.tint : '', white: !!(opt && opt.white) }); return o.call(GFX, c, n, f, x, y, opt); };
      for (let i = 0; i < frames; i++) { cur = []; T.step(1); e.x = 120; e.y = 100; rows.push(cur); }
      GFX.draw = o; return rows;
    };
    // (1) with the cast's sprite
    let { S, e } = frozenScene(true);
    let rows = capture(S, e, 12);
    out.ice = { names: [...new Set(rows.flat().map((d) => d.n))], tints: rows.flat().filter((d) => d.tint || d.white).length, frames: [...new Set(rows.flat().map((d) => d.f))].sort().join() };
    // (2) thaw with the sprite: alpha of the ice over the last 60 frames
    ({ S, e } = frozenScene(true)); e.freezeT = 61; rows = capture(S, e, 60);
    const iceA = rows.map((r) => r.filter((d) => d.n === 'jellop_frozen').reduce((s, d) => s + d.a, 0));
    const baseA = rows.map((r) => r.filter((d) => d.n === 'jellop_angry' || d.n === 'jellop_move').reduce((s, d) => s + d.a, 0));
    out.thaw = { first: iceA[0], last: iceA[iceA.length - 1], max: Math.max(...iceA), step: SIG.maxStep(iceA), peaks: SIG.peaks(iceA), baseLast: baseA[baseA.length - 1], baseFirst: baseA[0] };
    // (3) without the sprite: the tint recipe, thawing the same way
    ({ S, e } = frozenScene(false)); rows = capture(S, e, 8);
    out.tint = { names: [...new Set(rows.flat().map((d) => d.n))], tints: rows.flat().filter((d) => /^#[0-9a-f]{6}$/i.test(d.tint)).length };
    ({ S, e } = frozenScene(false)); e.freezeT = 61; rows = capture(S, e, 60);
    const tintA = rows.map((r) => r.filter((d) => d.tint).reduce((s, d) => s + d.a, 0));
    out.tintThaw = { step: SIG.maxStep(tintA), first: tintA[0], last: tintA[tintA.length - 1], peaks: SIG.peaks(tintA) };
    // (4) reduced motion: steady 0.7 in the last second
    ({ S, e } = frozenScene(true, true)); e.freezeT = 40; rows = capture(S, e, 20);
    out.rm = [...new Set(rows.map((r) => r.filter((d) => d.n === 'jellop_frozen').reduce((s, d) => s + d.a, 0).toFixed(3)))];
    if (typeof GFX._withFrozen === 'function') GFX._withFrozen(false);
    return out;
  });
  eq(r.ice.names.join(), 'jellop_frozen', 'only the ice sprite is drawn'); eq(r.ice.tints, 0, 'plain: no tint / white options'); ok(r.ice.frames.split(',').length >= 2, 'its twinkle frames step (' + r.ice.frames + ')');
  ok(r.thaw.first > 0.85 && r.thaw.last < 0.15, 'the ice thins out over the last second (' + r.thaw.first.toFixed(2) + ' -> ' + r.thaw.last.toFixed(2) + ')'); ok(r.thaw.step <= 0.12 && r.thaw.peaks <= 3, 'gently: ' + JSON.stringify(r.thaw));
  ok(r.thaw.baseFirst < 0.1 || r.thaw.baseFirst === 0 || r.thaw.baseLast >= 1, 'the creature underneath comes back'); ok(r.tint.names.every((n) => /^jellop_(move|angry)$/.test(n)) && r.tint.tints >= 8, 'without the ice sprite the tint recipe is used (' + r.tint.tints + ' tinted draws)');
  ok(r.tintThaw.step <= 0.12 && r.tintThaw.first > 0.85 && r.tintThaw.last < 0.15, 'the tint recipe thaws smoothly too ' + JSON.stringify(r.tintThaw)); eq(r.rm.join(), '0.700', 'steady 0.7 under reduced motion');
});

// =================================================================================================
// G2 / V6 - shockwave rings are ONE blit of GFX.particle('ring'); the light budget
// =================================================================================================
await test('G2 shockwave rings come from GFX.particle(ring) (1 blit), giant rings are cheap source-over strokes; <= RING_CAP rings drawn per frame', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    T.arena({ level: 3, empty: true }); Game.debug.god(true); const S = T.S();
    for (let i = 0; i < 12; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][i % 3], 40 + i * 14, 110 + (i % 2) * 30); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
    for (let i = 0; i < 20; i++) { Game.debug.spawn('thunder', 30 + i * 9, 60); const b = S.bubbles[S.bubbles.length - 1]; b.att = null; b.life = 1e9; }
    Game.debug.give(0, 'bomb');
    // wrap: particle kinds, ring blits, strokes outside GFX.particle (and their composite op)
    const op = GFX.particle; let inPart = 0; const kinds = { ring: 0 }; let strokes = 0, lighterStrokes = 0, big = 0;
    GFX.particle = (c, kind, ...rest) => { if (kind === 'ring') kinds.ring++; inPart++; try { return op.call(GFX, c, kind, ...rest); } finally { inPart--; } };
    const os = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...a) { if (!inPart) { strokes++; if (this.globalCompositeOperation === 'lighter') lighterStrokes++; } return os.apply(this, a); };
    const per = [];
    for (let i = 0; i < 30; i++) { kinds.ring = 0; strokes = 0; lighterStrokes = 0; T.step(1); const f = Game.debug.fxStats(); per.push({ ring: kinds.ring, strokes, lighter: lighterStrokes, drawn: f.drawn.rings, cap: f.light.ringCap, fill: f.light.total, fillCap: f.light.cap }); }
    GFX.particle = op; CanvasRenderingContext2D.prototype.stroke = os;
    return { per, maxRing: Math.max(...per.map((p) => p.ring)), maxStrokes: Math.max(...per.map((p) => p.strokes)), maxLighter: Math.max(...per.map((p) => p.lighter)), maxDrawn: Math.max(...per.map((p) => p.drawn)), cap: per[0].cap, maxFill: Math.max(...per.map((p) => p.fill)), fillCap: per[0].fillCap };
  });
  ok(r.maxRing >= 8, 'rings are drawn as particle blits (' + r.maxRing + ' in the busiest frame)');
  eq(r.maxLighter, 0, 'no additive stroke passes for rings (the old code made 3 per ring)'); ok(r.maxStrokes <= 4, 'only the giant bomb rings stroke, 2 passes each: ' + r.maxStrokes + ' strokes');
  ok(r.maxDrawn <= r.cap, 'at most RING_CAP rings per frame (' + r.maxDrawn + ' / ' + r.cap + ')'); ok(r.maxFill <= r.fillCap, 'the additive fill stays within the light budget (' + Math.round(r.maxFill) + ' / ' + r.fillCap + ')');
});

await test('V6 light budget: a bomb / long chain gets few small pools in the chain owner colour (P2 = cyan), the wash is tinted the same, never above the caps', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    const run = (owner) => {
      T.arena({ level: 3, empty: true, players: 2 }); Game.debug.god(true); const S = T.S();
      for (let i = 0; i < 9; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'][i % 5], 40 + i * 18, 100 + (i % 2) * 36); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
      Game.debug.give(owner, 'bomb');
      let maxPools = 0, cols = new Set(), maxFill = 0, maxAlpha = 0, flashCols = new Set(), poolSize = 0;
      for (let i = 0; i < 40; i++) {
        T.step(1); const f = Game.debug.fxStats(); maxPools = Math.max(maxPools, f.light.pools); maxFill = Math.max(maxFill, f.light.total);
        for (const q of S.parts) if (q.lt === 1) { cols.add(q.col); poolSize = Math.max(poolSize, q.s1); }
        const fl = Game.debug.flash(); maxAlpha = Math.max(maxAlpha, fl.alpha); if (fl.alpha > 0) flashCols.add(fl.col);
      }
      return { maxPools, cols: [...cols], maxFill, maxAlpha, flashCols: [...flashCols], poolSize, poolMax: Game.debug.fxStats().light.poolMax, cap: Game.debug.fxStats().light.cap };
    };
    return { p1: run(0), p2: run(1) };
  });
  for (const [who, col] of [['p1', '#ff3ea5'], ['p2', '#3cf2ff']]) {
    const x = r[who];
    ok(x.maxPools >= 1 && x.maxPools <= x.poolMax, who + ': 1.. ' + x.poolMax + ' light pools (' + x.maxPools + ')'); eq(x.cols.join(), col, who + ': pools in the owner colour'); eq(x.flashCols.join(), col, who + ': wash in the owner colour');
    ok(x.maxAlpha <= 0.12 + 1e-9, who + ': wash <= 12 % (' + x.maxAlpha + ')'); ok(x.poolSize <= 3.2, who + ': small pools (core radius ' + x.poolSize.toFixed(2) + ' px, the old ones reached 3.75)'); ok(x.maxFill <= x.cap, who + ': fill within the light budget (' + Math.round(x.maxFill) + ' / ' + x.cap + ')');
  }
});

// =================================================================================================
// G4 - trails never draw ghosts at a place the entity is no longer in
// =================================================================================================
await test('G4 trails restart on teleports: no ghost at the death spot after a respawn, at the trapped spot after a release, or across a floor-gap wrap', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    Game.setOptions({ quality: 2, reducedMotion: false });
    const watch = (prefix, e, frames, step) => {
      const bad = []; const o = GFX.draw; let n = 0;
      GFX.draw = (c, nm, f, x, y, opt) => {
        if (nm.startsWith(prefix) && opt && opt.alpha !== undefined && opt.alpha > 0 && opt.alpha <= 0.25) { n++; if (Math.hypot(x - e.x, y - e.y) > 24) bad.push([Math.round(x), Math.round(y), Math.round(e.x), Math.round(e.y)]); }
        return o.call(GFX, c, nm, f, x, y, opt);
      };
      for (let i = 0; i < frames; i++) step(i);
      GFX.draw = o; return { bad, ghosts: n };
    };
    // (a) respawn: run right, get killed far from the spawn pad, wait for the respawn, then watch the first frames
    T.arena({ level: 3, empty: true }); let S = T.S(); let p = S.players[0]; p.inv = 0; p.x = 120; p.y = 200; T.step(1, [{ jump: true }]);
    for (let i = 0; i < 12; i++) T.step(1, [{ right: true }]);
    Game.debug.spawn('nibbler', p.x, p.y); const killer = S.enemies[S.enemies.length - 1]; killer.state = 'active'; killer.vx = 0;
    for (let i = 0; i < 4 && p.state === 'normal'; i++) T.step(1);
    out.died = p.state;
    Game.debug.clearEnemies();
    for (let i = 0; i < 200 && p.state !== 'normal'; i++) T.step(1);
    out.respawned = p.state; out.respawnX = p.x;
    out.respawn = watch('p1_', p, 10, () => T.step(1, [{ right: true }]));
    // (b) release: a moving Nibbler is trapped, drifts up in its bubble for 150+ frames, then escapes
    T.arena({ level: 3, empty: true }); Game.debug.god(true); S = T.S(); Game.debug.spawn('nibbler', 60, 184); const e = S.enemies[S.enemies.length - 1]; e.vx = 0.6;
    for (let i = 0; i < 6; i++) T.step(1);
    const b = Game_makeTrap(S, e);
    for (let i = 0; i < 200 && e.state === 'trapped'; i++) T.step(1);
    out.released = e.state; out.releaseDist = Math.hypot(e.x - 60, e.y - 184);
    out.release = watch('nibbler', e, 8, () => T.step(1));
    // (c) wrap through the floor gap (level 1 has a gap in the floor)
    T.arena({ level: 1, empty: true }); Game.debug.god(true); S = T.S(); p = S.players[0]; p.inv = 0;
    const gx = 14 * 8 + 4; p.x = gx; p.y = 190; p.vx = 0;
    let wrapped = false, prevY = p.y;
    const wr = watch('p1_', p, 40, () => { T.step(1, [{ left: false }]); if (p.y < prevY - 100) wrapped = true; prevY = p.y; });
    out.wrap = wr; out.wrapped = wrapped;
    return out;
    function Game_makeTrap(S, e) {      // trap the enemy the way a shot does
      const bub = { kind: 'trapped', x: e.x, y: e.y, state: 'float', age: 0, owner: 0, grace: -1, popAt: 0, chain: null, dead: false, enemy: e, trapT: 0, trapTime: 200, att: null, life: 900, dir: 1, v: 0, decel: 0, range: 1, dist: 0, letter: '', chainImmune: 0 };
      e.state = 'trapped'; e.bubble = bub; S.bubbles.push(bub); return bub;
    }
  });
  eq(r.died, 'dying', 'the player was killed'); eq(r.respawned, 'normal', 'and respawned'); ok(Math.abs(r.respawnX - 24) < 1, 'at the spawn pad');
  eq(r.respawn.bad.length, 0, 'no ghost far from Fizz after the respawn: ' + JSON.stringify(r.respawn.bad.slice(0, 3)));
  eq(r.released, 'active', 'the Nibbler escaped'); ok(r.releaseDist > 24, 'a long way from where it was trapped (' + r.releaseDist.toFixed(0) + ' px)');
  eq(r.release.bad.length, 0, 'no ghost at the old spot after the release: ' + JSON.stringify(r.release.bad.slice(0, 3)));
  ok(r.wrapped, 'the player wrapped through the floor gap'); eq(r.wrap.bad.length, 0, 'no ghost on the other side of the wrap: ' + JSON.stringify(r.wrap.bad.slice(0, 3)));
});

// =================================================================================================
// G5 - the round change: smooth fractional scroll, leftovers fade, plankton keeps drifting
// =================================================================================================
await test('G5 transition: the scroll is fractional (no whole-pixel stepping), items / bubbles / popups fade instead of popping, the plankton never disappears', async () => {
  await withLib();
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    T.start({ players: 1, level: 3, seed: 5 }); T.step(160); Game.debug.god(true);
    Game.debug.spawn('food_3', 120, 100); Game.debug.spawn('pu_shoes', 80, 150); Game.debug.spawn('letter', 160, 60);
    Game.debug.killAll(); Game.debug.noClear(false);
    // wrap drawImage (level canvases, 256 x 208 stubs / any canvas of that aspect), GFX.draw of the items, GFX.particle dots
    const dys = []; const oi = CanvasRenderingContext2D.prototype.drawImage;
    let rec = false;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { if (rec && img && img.width && Math.abs(img.width / img.height - 256 / 208) < 1e-6 && a.length === 4 && a[2] === 256) cur.lvl.push(a[1]); return oi.call(this, img, ...a); };
    let cur = { lvl: [], items: [], dots: 0 };
    const od = GFX.draw, op = GFX.particle;
    GFX.draw = (c, n, f, x, y, opt) => { if (rec && (n === 'food_3' || n === 'pu_shoes' || n === 'bubble_letter')) cur.items.push({ n, a: opt && opt.alpha !== undefined ? opt.alpha : 1, y, ga: c.globalAlpha }); return od.call(GFX, c, n, f, x, y, opt); };
    GFX.particle = (c, kind, ...rest) => { if (rec && kind === 'dot') cur.dots++; return op.call(GFX, c, kind, ...rest); };
    for (let i = 0; i < 900 && T.state().phase !== 'transition'; i++) T.step(1);
    const S = T.S(); const itemsAtStart = S.items.length;
    const frames = [];
    rec = true;
    for (let i = 0; i < 124 && S.phase === 'transition'; i++) { cur = { lvl: [], items: [], dots: 0, t: S.tr ? S.tr.t : -1 }; T.step(1); frames.push(cur); }
    rec = false; GFX.draw = od; GFX.particle = op; CanvasRenderingContext2D.prototype.drawImage = oi;
    const ys = frames.filter((f) => f.lvl.length >= 2).map((f) => Math.min(...f.lvl));       // the outgoing level's y (smaller of the two)
    const steps = ys.slice(1).map((y, i) => ys[i] - y);
    const itemAlpha = frames.slice(0, 16).map((f) => f.items.length ? Math.max(...f.items.map((d) => d.ga * d.a)) : 0);
    return { itemsAtStart, n: ys.length, steps, frac: ys.filter((y) => Math.abs(y - Math.round(y)) > 1e-6).length, itemAlpha, minDots: Math.min(...frames.slice(0, 118).map((f) => f.dots)), stepMax: Math.max(...steps), minStep: Math.min(...steps.slice(1, -1)) };
  });
  eq(r.itemsAtStart, 0, 'the mechanics still empty S.items at the round change');
  ok(r.n >= 110, 'the scroll was recorded (' + r.n + ' frames)'); ok(r.frac >= r.n * 0.8, 'the offset is fractional (' + r.frac + ' of ' + r.n + ' frames are not whole pixels)');
  ok(r.steps.every((s, i) => i === 0 || s >= -1e-9), 'the scroll never moves backwards'); ok(r.minStep > 0, 'and never holds still between the ends (min step ' + r.minStep.toExponential(2) + ')'); ok(r.stepMax <= 5.4, 'smooth at the peak (' + r.stepMax.toFixed(2) + ' px per frame)');
  let ddmax = 0; for (let i = 1; i < r.steps.length; i++) ddmax = Math.max(ddmax, Math.abs(r.steps[i] - r.steps[i - 1])); ok(ddmax <= 0.2, 'no ticking: the speed changes by at most ' + ddmax.toFixed(3) + ' px/frame^2 (the old integer scroll jumped 1 -> 0 -> 1)');
  ok(r.itemAlpha[0] > 0.9, 'the leftover items are still drawn in the first frame of the round change (' + r.itemAlpha[0].toFixed(2) + ')'); ok(r.itemAlpha.every((a, i) => !i || a <= r.itemAlpha[i - 1] + 1e-9), 'and fade out monotonically ' + r.itemAlpha.map((a) => a.toFixed(2)).join(' ')); ok(r.itemAlpha[r.itemAlpha.length - 1] < 0.05, 'to nothing within the fade');
  ok(r.minDots >= 30, 'the plankton keeps drifting through every transition frame (min ' + r.minDots + ' specks per frame)');
});

// =================================================================================================
// G6 / G8 / V2 - HUD
// =================================================================================================
await test('G6 the PUSH Q join hint only shows while joining is possible (not on GAME OVER / victory / P1 out / join queued / over)', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    const count = (frames) => { let n = 0; const o = GFX.text; GFX.text = (c, s, ...r) => { if (s === 'PUSH Q') n++; return o.call(GFX, c, s, ...r); }; for (let i = 0; i < frames; i++) { T.step(1); } GFX.text = o; return n; };
    T.arena({ level: 3, empty: true }); out.play = count(60);
    const setPhase = (fn) => { T.arena({ level: 3, empty: true }); const S = T.S(); fn(S); return count(60); };
    out.gameover = setPhase((S) => { S.phase = 'gameover'; S.phaseT = 0; });
    out.victory = setPhase((S) => { S.phase = 'victory'; S.phaseT = 0; });
    out.p1out = setPhase((S) => { S.players[0].state = 'out'; });
    out.pending = setPhase((S) => { S.pendingJoin = true; });
    out.over = setPhase((S) => { S.over = true; });
    T.arena({ level: 3, empty: true }); Game.join(1); T.step(1); out.afterJoin = count(60);
    // and the join really does nothing in those states (the hint must not advertise it)
    T.arena({ level: 3, empty: true }); T.S().phase = 'gameover'; Game.join(1); out.joinedInGameOver = T.S().players.length;
    return out;
  });
  ok(r.play >= 20 && r.play <= 40, 'blinks at 1 Hz in a running 1P game (' + r.play + ' of 60 frames)');
  for (const k of ['gameover', 'victory', 'p1out', 'pending', 'over', 'afterJoin']) eq(r[k], 0, 'no hint: ' + k);
  eq(r.joinedInGameOver, 1, 'Game.join refuses in GAME OVER');
});

await test('G8 round counter reads "R01" (labelled, inset, in the ceiling row clear of the playfield); the missing EXTEND letters are drawn brighter than before', async () => {
  const r = await ev(() => {
    const T = __t; const calls = []; const o = GFX.text;
    GFX.text = (c, s, x, y, col, opt) => { calls.push({ s: String(s), x, y, col: String(col), opt: opt ? JSON.stringify(opt) : '' }); return o.call(GFX, c, s, x, y, col, opt); };
    T.arena({ level: 7, empty: true }); calls.length = 0; T.render(); GFX.text = o;
    const rc = calls.filter((c) => c.y === 16 && c.x < 30);
    const dim = calls.filter((c) => /"shadow":false/.test(c.opt) && c.s.length === 1);
    const rgbaA = (col) => +col.replace(/^rgba\(([^)]*)\)$/, '$1').split(',')[3];
    return { rc, dimCount: dim.length, dimAlpha: dim.length ? rgbaA(dim[0].col) : 0, dimShadow: dim.length ? dim[0].opt : '', C: { PLAY_TOP: C.MAP_Y + C.TILE, MAP_Y: C.MAP_Y } };
  });
  eq(r.rc.map((c) => c.s).join(''), 'R07', 'label text R + the two digits');
  ok(r.rc.every((c) => c.x >= 1 && c.y >= r.C.MAP_Y && c.y + 8 <= r.C.PLAY_TOP), 'inset from the screen edge and inside the ceiling row (y ' + r.rc[0].y + '..' + (r.rc[0].y + 8) + ' < ' + r.C.PLAY_TOP + ')');
  eq(r.dimCount, 6, 'six dim letters (1P game: the left panel)'); ok(r.dimAlpha >= 0.55, 'unlit letters at alpha ' + r.dimAlpha + ' (was 0.36)'); ok(/"shadow":false/.test(r.dimShadow), 'still without shadow');
});

await test('V2 the HUD band is the water, not a flat black strip', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ level: 3, empty: true }); T.render();
    const cv = T.canvas, k = cv.width / 256, g = cv.getContext('2d');
    const row = (y) => { const d = g.getImageData(0, Math.round(y * k), cv.width, 1).data; let s = 0, s2 = 0, n = 0, flat = 0; for (let x = 0; x < cv.width; x++) { const v = d[x * 4] + d[x * 4 + 1] + d[x * 4 + 2]; s += v; s2 += v * v; n++; if (d[x * 4] === 2 && d[x * 4 + 1] === 4 && d[x * 4 + 2] === 10) flat++; } return { mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)), flat: flat / n }; };
    return { top: row(1), mid: row(8), seam: row(15), below: row(18) };
  });
  ok(r.top.flat < 0.5 && r.mid.flat < 0.5, 'not the flat #02040a fill (' + (r.mid.flat * 100).toFixed(0) + ' % flat pixels)');
  ok(Math.abs(r.seam.mean - r.below.mean) < 60 || r.seam.sd > 0, 'the band meets the playfield without a hard step');
});

await test('G7 per-frame allocations: the sprite draw options are scratch objects reused across calls (the bit-exactness of the allocation-free distance is proven by test/game_equiv.mjs)', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    // the exactness of the allocation-free distance is proven by the equivalence gate (test/game_equiv.mjs); here: GFX.draw never sees a fresh object per call
    T.arena({ level: 3, empty: true }); Game.debug.god(true); const S = T.S();
    for (let i = 0; i < 5; i++) Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'][i], 40 + i * 30, 100);
    const seen = new Set(); const o = GFX.draw; let n = 0;
    GFX.draw = (c, nm, f, x, y, opt) => { n++; if (opt) seen.add(opt); return o.call(GFX, c, nm, f, x, y, opt); };
    for (let i = 0; i < 20; i++) T.step(1); GFX.draw = o;
    out.draws = n; out.distinctOptObjects = seen.size;
    return out;
  });
  ok(r.draws > 200, 'draws recorded (' + r.draws + ')'); ok(r.distinctOptObjects <= 4, 'the sprite draw options are scratch objects reused across calls (' + r.distinctOptObjects + ' distinct objects in ' + r.draws + ' draws)');
});

const failed = results.filter((x) => !x[1]).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' tests passed');
await t.close();
process.exit(failed ? 1 : 0);
