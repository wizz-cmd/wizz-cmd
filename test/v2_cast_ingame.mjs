// FIZZ & POP v3 - cast fixes seen IN the real built game (role "cast").   node test/v2_cast_ingame.mjs [--html path] [--out dir]
// Review shots (canvas pixels at the game's own k) of the V3 cast changes: heroes (C3), angry + frozen rows (C4 / V1), the Kraken's ink volley (C1, V7), the three trap stages (C2),
// specials (C5), pearls (V8).  Game does not draw <e>_frozen yet when this runs before its own wave lands: a PATCHED COPY of the page (written next to the shots) makes
// drawFrozen() use the sprites exactly like the documented integration (GFX.has('<e>_frozen') -> GFX.draw(..., frame, ...)).  Exit 1 on any console error.
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, fp, PROJECT, DEFAULT_HTML } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = opt('out', path.join(PROJECT, 'out', 'v3', 'cast', 'ingame'));
fs.mkdirSync(OUT, { recursive: true });
let html = opt('html', DEFAULT_HTML);
const src = fs.readFileSync(html, 'utf8');
const needle = 'function drawFrozen(ctx, e, name, frame, flip) {';
let patched = false, out = src;
if (src.includes(needle) && !/_frozen/.test(src.slice(src.indexOf(needle), src.indexOf(needle) + 900))) {
  out = out.replace(needle, needle + "\n    if (GFX.has(e.t + '_frozen')) { GFX.draw(ctx, e.t + '_frozen', Math.floor(S.frame / 6) % 4, e.x, e.y, { flip }); return; }");
  patched = true;
}
// test-only debug helper in the patched copy: a trapped captive at a given trap-stage fraction (the real trapEnemy path, forced trapT)
if (out.includes('    _S: () => S,')) out = out.replace('    _S: () => S,', "    _S: () => S,\n    _trap(type, x, y, frac) { const e = makeActiveEnemy(type, x, y); S.enemies.push(e); const b = makeBubble('empty', x, y); S.bubbles.push(b); trapEnemy(b, e); b.trapT = Math.floor(frac * b.trapTime); b.att = null; b.vx = 0; b.vy = 0; },");
{ const p = path.join(OUT, '_game_patched.html'); fs.writeFileSync(p, out); html = p; }
console.log('page:', html, patched ? '(patched drawFrozen: Game has not integrated <e>_frozen yet)' : '(Game already draws <e>_frozen)');
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);
const errors = [];
const t = await launch({ html, viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 30000 });
await g.wait(250);
await g.evaluate(() => { fz._main.setQuality(2, true); });
await g.freeze(true);
const shot = async (name) => { await g.wait(500); await canvasShot(t.page, path.join(OUT, name), { scale: 1 }); console.log('shot', name); };
const fresh = async (level, seed = 3, players = 1) => { await g.start(players, level, seed); await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); }); await g.step(2); };

// 1. heroes next to the enemies (round 1, 2P)
if (want('heroes')) {
await fresh(1, 5, 2);
await g.evaluate(() => { const D = fz.Game.debug; ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].forEach((e, i) => D.spawn(e, 40 + i * 36, 100)); });
await g.step(40); await shot('01_heroes_vs_enemies_r1.png');
}
// 2. angry / frozen / calm rows on the crystal caves
if (want('frozen')) {
await fresh(17, 7, 2);
await g.evaluate(() => {
  const D = fz.Game.debug, S = D._S(), ts = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  ts.forEach((ty, i) => { D.spawn(ty, 30 + i * 40, 84); const e = S.enemies[S.enemies.length - 1]; e.angry = true; e.vx = 0; });
  ts.forEach((ty, i) => { D.spawn(ty, 30 + i * 40, 152); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; e.vx = e.vy = 0; });
  ts.forEach((ty, i) => D.spawn(ty, 30 + i * 40, 36));
});
await g.step(30); await shot('02_angry_frozen_calm_r17.png');
for (const lv of [1, 6, 11, 21, 26]) {                      // frozen on the other themes
  await fresh(lv, 9, 1);
  await g.evaluate(() => { const D = fz.Game.debug, S = D._S(); ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].forEach((ty, i) => { D.spawn(ty, 40 + i * 30, 192); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; e.vx = e.vy = 0; }); });
  await g.step(20); await shot('03_frozen_r' + String(lv).padStart(2, '0') + '.png');
}
}
// 3. boss: the ink volley over the Kraken, both phases
if (want('boss')) {
await g.start(2, 30, 3); await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); });
let seen = 0;
for (let i = 0; i < 400 && seen < 3; i++) {
  await g.step(1);
  const n = await g.evaluate(() => fz.Game.debug._S().proj.filter((q) => q.type === 'ink').length);
  if (n > 0 && (i % 6 === 0)) { await shot('04_boss_ink_' + seen + '.png'); seen++; await g.step(4); }
}
await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find((e) => e.t === 'kraken'); if (k) k.hp = Math.max(1, Math.floor(S.bossMax * 0.3)); });
for (let i = 0; i < 500; i++) { await g.step(1); const n = await g.evaluate(() => fz.Game.debug._S().proj.filter((q) => q.type === 'ink').length); if (n > 0 && i % 9 === 0) { await shot('04_boss_ink_phase2.png'); break; } }
}
// 4. the three trap stages (a trapped captive each, trapT forced to stage 0 / 1 / 2), plus specials and pearls
if (want('trap')) {
await fresh(6, 11, 1);
await g.evaluate(() => { const D = fz.Game.debug; [['nibbler', 0.2], ['crabbit', 0.65], ['jellop', 0.92], ['springle', 0.2], ['glimmer', 0.65]].forEach(([ty, f], i) => D._trap(ty, 36 + i * 40, 100, f)); D._trap('nibbler', 36, 150, 0.92); D._trap('crabbit', 76, 150, 0.2); D._trap('jellop', 116, 150, 0.65); D._trap('springle', 156, 150, 0.92); D._trap('glimmer', 196, 150, 0.2); });
await g.step(1); await shot('05_trap_stages.png');
}
if (want('specials')) {
await fresh(6, 12, 1);
await g.evaluate(() => { const D = fz.Game.debug; ['thunder', 'fire', 'water', 'letter'].forEach((k, i) => D.spawn(k, 40 + i * 44, 100)); ['pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'].forEach((k, i) => D.spawn(k, 24 + i * 28, 170)); });
await g.step(6); await shot('06_specials_and_pearls.png');
}
console.log('errors', t.errors);
errors.push(...t.errors);
await t.close();
process.exit(errors.length ? 1 : 0);
