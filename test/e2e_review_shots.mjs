// FIZZ & POP v2.0 - review shots for the lead designer -> out/v2/review/*.png        node test/e2e_review_shots.mjs [--only=title,rounds,...] [--html path]
// Every shot is the real built game (dist/fizzpop.html): canvas pixels at the game's own bake scale k (scale 1 = the backing store, crisp), page shots show the chrome around it.
//   title (desktop + phone portrait), howto (6 pages), story, rounds 1/6/11/16/21/26/30 mid-play with many entities (one per theme), angry + frozen enemies,
//   specials (thunder / fire / water), hurry + Bonefin, chain reaction, boss fight, victory, ending, scores, entry, pause, game over + EXTEND banners, GFX.sheet() at k = 3.
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, canvasFnShot, pageShot, fp, PROJECT, DEFAULT_HTML } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const HTML = opt('html', DEFAULT_HTML);
const OUT = path.join(PROJECT, 'out', 'v2', 'review');
fs.mkdirSync(OUT, { recursive: true });
const want = (n) => !ONLY || ONLY.has(n);
const shots = [];
const allErrors = [];
const P = (n) => path.join(OUT, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(opts = {}) {
  const t = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, ...opts });
  const g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 30000 });
  await g.wait(250);
  return { t, g, page: t.page };
}
const cshot = async (page, name) => { shots.push(await canvasShot(page, P(name), { scale: 1 })); console.log('shot ' + name); };
const pshot = async (page, name) => { shots.push(await pageShot(page, P(name))); console.log('shot ' + name); };
const done = (t, label) => { const e = t.errors.splice(0); if (e.length) { console.log(`ERRORS [${label}]`, e); allErrors.push(...e.map((x) => label + ': ' + x)); } };
const lock = (g) => g.evaluate(() => { fz._main.setQuality(2, true); });            // full quality for the review (auto quality would drop under CPU raster)

// ---- title / howto / story / scores ------------------------------------------------------------------------------
async function sTitle() {
  let { t, g, page } = await open();
  await lock(g); await g.wait(2200);
  await cshot(page, '01_title_desktop_canvas.png'); await pshot(page, '01_title_desktop_page.png');
  done(t, 'title desktop'); await t.close();
  ({ t, g, page } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, touch: true }));
  await g.wait(2500);
  await pshot(page, '02_title_phone_portrait.png');
  done(t, 'title phone'); await t.close();
  ({ t, g, page } = await open({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, touch: true }));
  await g.wait(2500);
  await pshot(page, '02b_title_phone_landscape.png');
  done(t, 'title phone landscape'); await t.close();
  // dark colour scheme page chrome + light
  ({ t, g, page } = await open({ colorScheme: 'dark' })); await g.wait(2000); await pshot(page, '02c_title_desktop_dark_page.png'); done(t, 'title dark'); await t.close();
}
async function sScenes() {
  const { t, g, page } = await open();
  await lock(g); await g.freeze(true);
  await g.goto('story', { attract: true }); await g.step(220); await cshot(page, '04_story.png');
  await g.goto('story', { attract: true }); await g.step(520); await cshot(page, '04b_story_late.png');
  for (let p = 0; p < 6; p++) { await g.goto('howto', { page: p }); await g.step(40); await cshot(page, `03_howto_${p}.png`); }
  await g.goto('scores', {}); await g.step(120); await cshot(page, '11_scores.png');
  done(t, 'scenes'); await t.close();
}

// ---- rounds mid-play with many entities ----------------------------------------------------------------------------
async function sRounds() {
  const { t, g, page } = await open();
  await lock(g); await g.freeze(true);
  const rounds = [1, 6, 11, 16, 21, 26, 30];
  for (const r of rounds) {
    await g.start(2, r, 40 + r);
    await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); });
    // play 200 frames with both players shooting so there are bubbles, trapped enemies, popups
    for (let i = 0; i < 10; i++) {
      await g.set(0, { right: i % 4 < 2, left: i % 4 >= 2, fire: true, jump: i % 3 === 0 });
      await g.set(1, { left: i % 4 < 2, right: i % 4 >= 2, fire: i % 2 === 0, jump: i % 4 === 1 });
      await g.step(20);
    }
    await g.evaluate(() => {
      const D = fz.Game.debug, S = D._S(); const E = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'crabbit'];
      if (S.level !== 30) E.forEach((e, i) => D.spawn(e, 40 + i * 36, 56 + (i % 3) * 52));
      ['food_1', 'food_4', 'pu_clock', 'pu_pink', 'food_6', 'pu_shoes'].forEach((k, i) => D.spawn(k, 40 + i * 38, 190 - (i % 2) * 60));
      ['thunder', 'fire', 'water'].forEach((k, i) => D.spawn(k, 70 + i * 50, 110));
      D.addScore(0, 12300); D.addScore(1, 8700);
    });
    await g.step(40);
    await cshot(page, `05_round_${String(r).padStart(2, '0')}_midplay.png`);
  }
  await g.clear();
  done(t, 'rounds'); await t.close();
}

// ---- angry + frozen, specials, hurry + bonefin, chain, boss, victory, game over, extend, pause -------------------------
async function sMoments() {
  const { t, g, page } = await open();
  await lock(g); await g.freeze(true);
  const fresh = async (level, seed = 3, players = 1) => { await g.start(players, level, seed); await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); }); await g.step(2); };
  const place = (x, y) => g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x, y, vx: 0, vy: 0 }), x, y);

  // angry + frozen side by side (round 17, crystal caves)
  await fresh(17, 7, 2);
  await g.evaluate(() => {
    const D = fz.Game.debug, S = D._S(); const ts = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
    ts.forEach((ty, i) => { D.spawn(ty, 30 + i * 40, 84); const e = S.enemies[S.enemies.length - 1]; e.angry = true; e.vx = 0; });
    ts.forEach((ty, i) => { D.spawn(ty, 30 + i * 40, 152); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; e.vx = 0; e.vy = 0; });
    ts.forEach((ty, i) => D.spawn(ty, 30 + i * 40, 36));
  });
  await g.step(30); await cshot(page, '06_angry_frozen_calm_rows.png');

  // specials: thunder / fire / water
  await fresh(19, 4); await place(24, 200); await g.evaluate(() => { const D = fz.Game.debug; D.spawn('nibbler', 170, 200); D.spawn('thunder', 28, 196); }); await g.step(14); await cshot(page, '07_special_thunder.png');
  await fresh(10, 4); await place(24, 200); await g.evaluate(() => { fz.Game.debug.spawn('fire', 28, 190); }); await g.step(60); await cshot(page, '07_special_fire.png');
  await fresh(8, 4); await place(60, 200); await g.evaluate(() => fz.Game.debug.spawn('water', 64, 190)); await g.step(36); await cshot(page, '07_special_water.png');

  // hurry up + Bonefin
  await fresh(6, 5); await g.evaluate(() => { const D = fz.Game.debug; for (const [ty, x, y] of [['nibbler', 60, 100], ['crabbit', 150, 150], ['jellop', 200, 80]]) D.spawn(ty, x, y); D.setHurryTimer(-1); });
  await g.step(150); await cshot(page, '08_hurry_bonefin_a.png');
  await g.evaluate(() => fz.Game.debug.spawn('bonefin', 40, 60)); await g.step(160); await cshot(page, '08_hurry_bonefin_b.png');

  // chain reaction: frozen row + bomb
  await fresh(8, 6, 2);
  await g.evaluate(() => { const D = fz.Game.debug, S = D._S(); for (let k = 0; k < 8; k++) { D.spawn(['nibbler', 'crabbit', 'jellop', 'springle'][k % 4], 40 + k * 24, k % 2 ? 100 : 150); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; e.vx = e.vy = 0; } D.give(0, 'bomb'); });
  for (const n of [8, 10]) { await g.step(n); await cshot(page, `09_chain_reaction_f${String(n).padStart(2, '0')}.png`); }

  // boss fight
  await g.start(2, 30, 3); await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); }); await g.step(150); await cshot(page, '10_boss_fight_a.png');
  await g.evaluate(() => { const D = fz.Game.debug; D.spawn('thunder', 120, 120); D.spawn('thunder', 160, 100); }); await g.step(34); await cshot(page, '10_boss_fight_b_thunder.png');
  await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find((e) => e.t === 'kraken'); if (k) k.hp = Math.max(1, Math.floor(S.bossMax * 0.3)); }); await g.step(60); await cshot(page, '10_boss_fight_c_low_hp.png');
  // victory
  await g.evaluate(() => fz.Game.debug.killAll());
  let s = await g.state(); for (let i = 0; i < 80 && !s.bubbles.some((b) => b.kind === 'kraken'); i++) { await g.step(5); s = await g.state(); }
  await g.step(30); await cshot(page, '11b_boss_trapped_bubble.png');
  for (let i = 0; i < 400 && !(s.phase === 'victory' || s.over); i++) {
    s = await g.state(); const kb = s.bubbles.find((b) => b.kind === 'kraken'); const pearl = s.items.find((it) => it.kind === 'moonpearl');
    if (kb) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 24, y: y + 24, vy: 0 }), kb.x, kb.y); else if (pearl) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 8, y, vy: 0 }), pearl.x, pearl.y);
    await g.step(3);
    if (s.items.some((it) => it.kind === 'moonpearl') && !shots.some((f) => f.endsWith('11c_moon_pearl.png'))) await cshot(page, '11c_moon_pearl.png');
  }
  await g.step(20); await cshot(page, '12_victory.png');

  // game over, EXTEND
  await fresh(5, 8); await g.evaluate(() => { const D = fz.Game.debug, S = D._S(); D.god(false); const p = S.players[0]; p.lives = 1; D.spawn('nibbler', p.x, p.y); }); await g.step(130); await cshot(page, '13_game_over.png');
  await fresh(2, 9); await g.evaluate(() => { const D = fz.Game.debug, S = D._S(); const p = S.players[0]; p.letters = [true, true, true, true, true, false]; D.spawn('letter', p.x + 8, p.y - 6); }); await g.step(40); await cshot(page, '13b_extend.png');
  // round intro banner
  await g.start(1, 12, 3); await g.step(40); await cshot(page, '13c_round_intro_banner.png');
  done(t, 'moments'); await t.close();
}

async function sPause() {
  const { t, g, page } = await open();
  await lock(g);
  await page.keyboard.press('Enter'); await g.wait(500); await page.keyboard.press('Enter'); await g.wait(3200);
  await page.keyboard.press('KeyP'); await g.wait(400);
  await cshot(page, '14_pause.png'); await pshot(page, '14_pause_page.png');
  await page.keyboard.press('ArrowDown'); await g.wait(150); await page.keyboard.press('Enter'); await g.wait(300);
  await cshot(page, '14b_pause_quit_confirm.png');
  done(t, 'pause'); await t.close();
}

// ---- ending, name entry (natural flow) --------------------------------------------------------------------------------
async function sEnding() {
  const { t, g, page } = await open();
  await lock(g); await g.evaluate(() => fz._main.resetScores()); await g.freeze(true);
  await g.start(1, 30, 3); await g.evaluate(() => { fz.Game.debug.god(true); fz.Game.debug.addScore(0, 123456); });
  await g.evaluate(() => fz.Game.debug.skipIntro()); await g.evaluate(() => fz.Game.debug.killAll());
  let s = await g.state();
  for (let i = 0; i < 80 && !s.bubbles.some((b) => b.kind === 'kraken'); i++) { await g.step(5); s = await g.state(); }
  for (let i = 0; i < 600 && !(s.phase === 'victory' || s.over); i++) {
    s = await g.state(); const kb = s.bubbles.find((b) => b.kind === 'kraken'); const pearl = s.items.find((it) => it.kind === 'moonpearl');
    if (kb) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 24, y: y + 24, vy: 0 }), kb.x, kb.y); else if (pearl) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 8, y, vy: 0 }), pearl.x, pearl.y);
    await g.step(3);
  }
  let guard = 0; while ((await g.scene()) === 'play' && guard++ < 120) await g.step(10);
  await g.step(60); await cshot(page, '15_ending_a.png');
  await g.step(420); await cshot(page, '15_ending_b_credits.png');
  await g.step(700); await cshot(page, '15_ending_c.png');
  guard = 0; while ((await g.scene()) === 'ending' && guard++ < 160) { await g.hold(0, { fire: true }, 1); await g.step(120); }
  await g.step(40); await cshot(page, '16_name_entry.png');
  await g.hold(0, { up: true }, 1); await g.step(10); await cshot(page, '16b_name_entry_typing.png');
  done(t, 'ending'); await t.close();
}

async function sSheet() {
  const { t, g, page } = await open();
  await lock(g);
  shots.push(await canvasFnShot(page, P('17_gfx_sheet_k3.png'), () => { fz.GFX.setScale(3); return fz.GFX.sheet(); }, { scale: 1 })); console.log('shot 17_gfx_sheet_k3.png');
  done(t, 'sheet'); await t.close();
}

const sections = [['title', sTitle], ['scenes', sScenes], ['rounds', sRounds], ['moments', sMoments], ['pause', sPause], ['ending', sEnding], ['sheet', sSheet]];
for (const [name, fn] of sections) {
  if (!want(name)) continue;
  try { await fn(); } catch (e) { console.log(`SECTION ${name} threw: ${e && e.stack || e}`); allErrors.push(`${name} threw: ${e && e.message}`); }
}
fs.writeFileSync(P('_index.json'), JSON.stringify({ when: new Date().toISOString(), shots: shots.map((f) => path.basename(f)), errors: allErrors }, null, 1));
console.log(`\n${shots.length} shots in ${OUT}, ${allErrors.length} error(s)`);
process.exit(allErrors.length ? 1 : 0);
