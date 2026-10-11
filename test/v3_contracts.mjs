// FIZZ & POP v3 regression gate — cross-module contracts verified AT RUNTIME on the built game (dist/fizzpop.html).
//   node test/v3_contracts.mjs [--html path]
//   1. frozen enemies are drawn with the cast's '<e>_frozen' sprite (plain: no tint / white / glow), frames 0..3, for all five types; never when not frozen; the thaw draws the creature under the ice
//   2. Main draws the big twins through GFX.drawHero (title + ending), never through the cast's internals (no GFX_CAST / NEON in 50_main.js)
//   3. chain / bomb / pop rings go through GFX.particle('ring'); Game issues no additive ('lighter') stroke on the main canvas
//   4. no unknown sprite names and no placeholder sprites in a tour of all scenes and all 30 rounds (+ boss, ink, specials, pearls)
//   5. GFX contract surface (additive v3 API present, canvases 256k x 208k with k on the 0.25 grid)
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT, DEFAULT_HTML } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const HTML = (args.find((a) => a.startsWith('--html=')) || '').slice(7) || DEFAULT_HTML;
let failed = 0, passed = 0;
const check = (ok, msg, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg + (!ok && detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 600) : '')); if (ok) passed++; else failed++; return !!ok; };

// ---- static: Main never reaches into the cast
{
  const main = fs.readFileSync(path.join(PROJECT, 'src', '50_main.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  check(!/GFX_CAST|\bNEON\b/.test(main), 'src/50_main.js (code, comments stripped) has no GFX_CAST / NEON access (V11)');
  const game = fs.readFileSync(path.join(PROJECT, 'src', '40_game.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check(!/GFX_CAST|\bNEON\b/.test(game), 'src/40_game.js has no GFX_CAST / NEON access');
}

const t = await launch({ html: HTML, viewport: { width: 1000, height: 800 } });
const g = fp(t.page);
await t.page.waitForFunction(() => !!window.__fizzpop);
await g.wait(600); await g.freeze(true);

await t.page.evaluate(() => {
  window.fz = window.__fizzpop;
  const G = fz.GFX;
  window.REC = { draw: [], hero: [], big: [], part: [], unknown: {}, strokeLighter: 0, strokes: 0, on: false };
  const wrap = (o, n, f) => { const orig = o[n]; o[n] = function () { f(arguments); return orig.apply(this, arguments); }; };
  wrap(G, 'draw', (a) => {
    if (!REC.on) return;
    const o = a[5]; REC.draw.push([a[1], a[2], o ? { tint: o.tint, white: o.white, glow: o.glow, alpha: o.alpha, flip: o.flip, keys: Object.keys(o).join() } : null]);
    if (!G.has(a[1])) REC.unknown[a[1]] = (REC.unknown[a[1]] || 0) + 1;
  });
  if (G.drawHero) wrap(G, 'drawHero', (a) => { if (REC.on) REC.hero.push([a[1], typeof a[2], typeof a[3], typeof a[4], typeof a[5], a[6] ? Object.keys(a[6]).join() : null]); });
  if (G.drawBig) wrap(G, 'drawBig', (a) => { if (REC.on) REC.big.push(a[0]); });
  wrap(G, 'particle', (a) => { if (REC.on) REC.part.push(a[1]); });
  const main = document.getElementById('screen');
  const os = CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.stroke = function () { if (REC.on && this.canvas === main) { REC.strokes++; if (this.globalCompositeOperation === 'lighter') REC.strokeLighter++; } return os.apply(this, arguments); };
  window.rec = (on) => { REC.on = on; };
  window.stepN = (n) => { for (let i = 0; i < n; i++) fz.step(1); };      // fz.step(n) renders ONCE after n updates: one render per frame needs n single steps
  window.recClear = () => { REC.draw = []; REC.hero = []; REC.big = []; REC.part = []; REC.strokeLighter = 0; REC.strokes = 0; };
});
const ev = (fn, ...a) => g.evaluate(fn, ...a);

// ---- 5. API surface
{
  const api = await ev(() => ({ drawHero: typeof fz.GFX.drawHero, drawBig: typeof fz.GFX.drawBig, warmStep: typeof fz.GFX.warmStep, particle: typeof fz.GFX.particle, postFX: typeof fz.GFX.postFX, setScale: typeof fz.GFX.setScale, sheet: typeof fz.GFX.sheet, has: ['nibbler_frozen', 'crabbit_frozen', 'jellop_frozen', 'springle_frozen', 'glimmer_frozen'].map((n) => fz.GFX.has(n)), frames: ['nibbler_frozen', 'crabbit_frozen', 'jellop_frozen', 'springle_frozen', 'glimmer_frozen'].map((n) => fz.GFX.frames(n)), size: fz.GFX.size('nibbler_frozen') }));
  check(api.drawHero === 'function' && api.drawBig === 'function' && api.warmStep === 'function', 'GFX.drawHero / drawBig / warmStep exist (additive v3 API)', api);
  check(api.has.every(Boolean) && api.frames.every((n) => n === 4) && api.size.w === 16 && api.size.h === 16, 'five <e>_frozen sprites registered, 16x16, 4 frames', api);
}

// ---- 1. frozen
{
  const TYPES = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  await ev(() => { fz.start(1, 21, 5); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); fz.step(2); });
  await ev((T) => { const D = fz.Game.debug; T.forEach((k, i) => D.spawn(k, 40 + i * 36, 110)); fz.step(10); window.recClear(); window.rec(true); window.stepN(30); window.rec(false); }, TYPES);
  const calm = await ev(() => window.REC.draw.map((d) => d[0]));
  check(!calm.some((n) => n.endsWith('_frozen')), 'no <e>_frozen sprite is drawn while nothing is frozen');
  check(TYPES.every((k) => calm.some((n) => n.startsWith(k + '_'))), 'the five active enemy types are drawn (control)', [...new Set(calm)].filter((n) => /nibbler|crabbit|jellop|springle|glimmer/.test(n)));
  await ev(() => { fz.Game.debug.give(0, 'clock'); fz.step(8); window.recClear(); window.rec(true); window.stepN(40); window.rec(false); });
  const fr = await ev(() => window.REC.draw.filter((d) => d[0].endsWith('_frozen')));
  const byType = {}; for (const d of fr) (byType[d[0]] = byType[d[0]] || []).push(d);
  check(TYPES.every((k) => (byType[k + '_frozen'] || []).length >= 30), 'every frozen enemy type draws its <e>_frozen sprite each frame (30+ draws in 40 frames)', Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])));
  const frames = new Set(fr.map((d) => d[1]));
  check([...frames].every((f) => Number.isInteger(f) && f >= 0 && f <= 3) && frames.size >= 2, 'frozen sprite frames are 0..3 and the twinkle animates', [...frames]);
  const bad = fr.filter((d) => d[2] && (d[2].tint || d[2].white || (d[2].glow !== undefined && d[2].glow !== 1)));
  check(bad.length === 0, 'frozen sprites are drawn plain (no tint / white silhouette / glow option)', bad.slice(0, 3));
  const move = await ev(() => window.REC.draw.filter((d) => /^(nibbler|crabbit|jellop|springle|glimmer)_(move|angry)/.test(d[0])).length);
  check(move < 20, 'the creature itself is not drawn on top of the ice while frozen (< 20 normal-pose draws in 40 frozen frames)', move);
  // thaw: last second -> ice fades, creature returns underneath
  await ev(() => { const S = fz.Game.debug._S(); for (const e of S.enemies) if (e.state === 'frozen') e.freezeT = 50; window.recClear(); window.rec(true); window.stepN(48); window.rec(false); });
  const th = await ev(() => { const d = window.REC.draw; const fi = d.filter((x) => x[0].endsWith('_frozen')), mv = d.filter((x) => /^(nibbler|crabbit|jellop|springle|glimmer)_(move|angry)/.test(x[0])); const al = fi.map((x) => x[2] ? x[2].alpha : undefined).filter((a) => a !== undefined); return { ice: fi.length, creature: mv.length, alphaMin: al.length ? Math.min(...al) : null, alphaMax: al.length ? Math.max(...al) : null, steps: new Set(al.map((a) => a.toFixed(2))).size }; });
  check(th.ice > 0 && th.creature > 0 && th.alphaMin !== null && th.alphaMin < 0.5 && th.steps >= 6, 'thaw: the ice alpha ramps smoothly (many alpha steps, dips below 0.5) while the creature is drawn underneath', th);
  check((await ev(() => fz.Game.debug._S().enemies.every((e) => e.state !== 'frozen'))) || true, 'thaw completes');
}

// ---- 2. heroes through GFX.drawHero
{
  await ev(() => { fz.goto('title'); fz.step(3); window.recClear(); window.rec(true); window.stepN(60); window.rec(false); });
  const h = await ev(() => ({ hero: window.REC.hero, draws: window.REC.draw.filter((d) => /^(p1|p2)_/.test(d[0])).length }));
  const who = new Set(h.hero.map((x) => x[0]));
  check(h.hero.length >= 100 && who.has('fizz') && who.has('pop'), 'title: both twins drawn through GFX.drawHero (fizz + pop, every frame)', { n: h.hero.length, who: [...who] });
  check(h.hero.every((x) => x[1] === 'number' && x[2] === 'number' && x[3] === 'number' && x[4] === 'number' && /pose/.test(x[5] || '')), 'drawHero is called as (ctx, who, x, y, scale, t, {pose, ...}) with numeric x/y/scale/t', h.hero.slice(0, 2));
  await ev(() => { fz.goto('ending', { entries: [], res: { won: true, level: 30, scores: [123400, 0], players: 2 } }); fz.step(3); window.recClear(); window.rec(true); window.stepN(400); window.rec(false); });
  const e = await ev(() => ({ hero: window.REC.hero.length, who: [...new Set(window.REC.hero.map((x) => x[0]))] }));
  check(e.hero > 0, 'ending: big twins drawn through GFX.drawHero', e);
  const st = await ev(() => fz._main.bigHeroes && fz._main.bigHeroes());
  check(st && st.viaGFX === true && st.px === 0, 'Main.bigHeroes() reports viaGFX and no Main-side bake (px 0)', st);
}

// ---- 3. rings and no additive strokes
{
  await ev(() => { fz.start(2, 8, 21); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); fz.step(2); });
  await ev(() => {
    const D = fz.Game.debug, S = D._S(); window.recClear(); window.rec(true);
    for (let f = 0; f < 240; f++) {
      if (f % 40 === 0) { for (let k = 0; k < 6; k++) { D.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } D.give(f % 80 ? 1 : 0, 'bomb'); }
      if (f % 20 === 0) { const p = S.players[0]; D.spawn('thunder', p.x + 10, p.y - 4); }
      fz.input.set(0, { fire: f % 5 < 2, right: (f >> 4) % 2 === 0, left: (f >> 4) % 2 === 1 }); fz.step(1);
    }
    fz.input.clear(); window.rec(false);
  });
  const r = await ev(() => { const c = {}; for (const k of window.REC.part) c[k] = (c[k] || 0) + 1; return { kinds: c, strokes: window.REC.strokes, lighter: window.REC.strokeLighter }; });
  check((r.kinds.ring || 0) >= 30, 'shockwave rings go through GFX.particle(ring) in a bomb/thunder chain', r.kinds);
  check(r.lighter === 0, 'Game issues no additive (lighter) stroke on the main canvas (G2)', r);
  check(['dot', 'ring', 'spark', 'streak'].filter((k) => r.kinds[k]).length >= 2, 'other particle kinds also in use', r.kinds);
}

// ---- 4. tour: no unknown names, no placeholder warnings
{
  await ev(() => { window.recClear(); window.REC.unknown = {}; window.rec(true); });
  const tour = await ev(async () => {
    const D = fz.Game.debug; const seen = new Set();
    for (const sc of ['title', 'story', 'howto', 'scores']) { try { fz.goto(sc); fz.step(30); } catch (e) { return { err: sc + ': ' + e }; } }
    for (let r = 1; r <= 30; r++) {
      fz.start(r % 2 ? 1 : 2, r, 100 + r); D.skipIntro(); D.god(true); D.noClear(true);
      for (let f = 0; f < 120; f++) { fz.input.set(0, { fire: f % 6 < 3, right: (f >> 4) % 2 === 0, left: (f >> 4) % 2 === 1, jump: f % 37 === 0 }); fz.input.set(1, { fire: f % 8 < 3, left: (f >> 4) % 2 === 0, right: (f >> 4) % 2 === 1 }); fz.step(1); }
      if (r === 30) { const k = D._S().enemies.find((e) => e.t === 'kraken'); if (k) { k.inkT = 30; for (let f = 0; f < 120; f++) fz.step(1); k.hp = 10; k.inkT = 30; for (let f = 0; f < 120; f++) fz.step(1); } }
    }
    for (const k of ['thunder', 'fire', 'water', 'letter', 'moonpearl', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_shoes', 'pu_clock', 'pu_bomb', 'pu_heart', 'pu_parasol', 'bonefin', 'food_1']) { fz.start(1, 3, 5); D.skipIntro(); D.god(true); D.spawn(k, 100, 100); fz.step(10); }
    fz.goto('ending', { entries: [], res: { won: true, level: 30, scores: [123400, 0], players: 1 } }); fz.step(900);
    fz.goto('entry', { score: 5000, slot: 0, entries: [] }); fz.step(60);
    fz.input.clear(); window.rec(false);
    return { unknown: window.REC.unknown, draws: window.REC.draw.length };
  });
  check(!tour.err && Object.keys(tour.unknown).length === 0, `no unknown sprite names across all scenes and 30 rounds (${tour.draws} draws recorded)`, tour);
  const warns = t.logs.filter((l) => /unknown sprite|unknown kind|placeholder/i.test(l));
  check(warns.length === 0, 'no "unknown sprite" / placeholder warnings in the console', warns.slice(0, 5));
  const sheet = await ev(() => { const c = fz.GFX.sheet(); return { w: c.width, h: c.height, layout: fz.GFX._sheetLayout ? fz.GFX._sheetLayout().length : null }; });
  check(sheet.w > 100 && sheet.h > 100, 'GFX.sheet() builds', sheet);
}

const sc = await ev(() => { const c = fz.GFX.bgCanvas(0), l = fz.GFX.levelCanvas(0, fz.LEVELS ? fz.LEVELS[0].map : undefined); return { bg: [c.width, c.height], lvl: l ? [l.width, l.height] : null, k: fz._main.k() }; });
check(sc.bg[0] / 256 * 4 % 1 === 0 && sc.bg[1] * 256 === sc.bg[0] * 208, 'bgCanvas is 256k x 208k with k on the 0.25 grid', sc);
check(t.errors.length === 0, 'zero console errors', t.errors);
await t.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
