// FIZZ & POP -- wave-2 review screenshots for the lead designer (integration step 6).
//   node test/e2e_wave2_shots.mjs [--html path] [--only a,b]
// Output: out/wave2/shots/*.png (canvas x3 unless noted), out/wave2/shots/_index.json.
// Groups: title, howto, rounds (intro + mid-play of R1 / 11 / 16 / 21 / 30), enemies (angry + frozen), specials, hurry,
//         boss (HP bar, hit, angry, ink), victory, ending (tableau / credits / finale), scores, sheet (GFX.sheet at x3), phone.
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, pageShot, fp, PROJECT, DEFAULT_HTML } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'wave2', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const argVal = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const HTML = argVal('--html') || DEFAULT_HTML;
const ONLY = argVal('--only') ? new Set(argVal('--only').split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);
const index = [];
const note = (f, what) => { index.push({ file: f, what }); };

async function open(extra = {}) {
  const t = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, ...extra });
  const g = fp(t.page);
  await g.wait(300);
  return { t, g, page: t.page };
}
const shot = async (page, name, what) => { await canvasShot(page, path.join(OUT, name + '.png'), { scale: 3 }); note(name + '.png', what); };
const pshot = async (page, name, what) => { await pageShot(page, path.join(OUT, name + '.png')); note(name + '.png', what); };
const skipIntro = (g) => g.evaluate(() => fz.Game.debug.skipIntro());

/** Scripted human-ish play: walk, jump and blow bubbles for n frames so the screen fills with bubbles / trapped enemies. */
async function play(g, n, p2 = false) {
  const script = [[{ right: true }, 40], [{ right: true, jump: true }, 24], [{ right: true, fire: true }, 6], [{}, 14], [{ left: true }, 50], [{ jump: true, left: true }, 26], [{ left: true, fire: true }, 6], [{ fire: true }, 6], [{}, 18]];
  let done = 0;
  while (done < n) for (const [inp, k] of script) {
    if (done >= n) break;
    await g.set(0, inp);
    if (p2) await g.set(1, { ...inp, left: inp.right, right: inp.left });
    await g.step(k); done += k;
  }
  await g.clear();
}

// -------------------------------------------------------------------------------------------------------------------
async function groupTitle() {
  const { t, g, page } = await open();
  await g.goto('title'); await g.step(120);
  await shot(page, 'title_canvas', 'title screen (canvas x3)');
  await pshot(page, 'title_desktop_page', 'title, whole page at 1280x800 (desktop)');
  await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(40);
  await shot(page, 'title_menu_sel2', 'title with the second row selected');
  for (let p = 0; p < 6; p++) { await g.goto('howto', { page: p }); await g.step(40); await shot(page, `howto_${p}`, `how-to page ${p + 1}`); }
  await g.goto('story', { attract: true }); await g.step(150); await shot(page, 'story', 'story');
  await g.evaluate(() => fz._main.resetScores());
  await g.goto('scores', {}); await g.step(60); await shot(page, 'scores', 'hi-score table (default entries)');
  await g.goto('entry', { entries: [{ pi: 0, score: 41230, round: 9 }, { pi: 1, score: 5300, round: 9 }] }); await g.step(40);
  await shot(page, 'entry', 'name entry');
  await g.evaluate(() => fz._main.resetScores());
  await g.start(1, 5, 7); await g.step(120);
  await g.evaluate(() => fz._main.setPaused(true)); await g.step(2);
  await shot(page, 'pause', 'pause menu');
  console.log('title errors', t.errors); await t.close(); return t.errors;
}

async function groupPhone() {
  const { t, g, page } = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await g.wait(400);
  await g.goto('title'); await g.step(120);
  await pshot(page, 'phone_title_portrait', 'title on a 390x844 touch phone (portrait)');
  await g.start(1, 11, 5); await g.step(200);
  await pshot(page, 'phone_play_portrait', 'R11 play on a 390x844 touch phone (portrait)');
  await page.setViewportSize({ width: 844, height: 390 }); await g.wait(400);
  await pshot(page, 'phone_play_landscape', 'R11 play on an 844x390 touch phone (landscape)');
  await page.setViewportSize({ width: 360, height: 640 }); await g.wait(400);
  await g.goto('howto', { page: 0 }); await g.step(30);
  await pshot(page, 'phone_howto_360', 'how-to on 360x640');
  await page.setViewportSize({ width: 390, height: 844 }); await g.wait(300);
  await g.goto('title'); await g.step(5);
  console.log('phone errors', t.errors); await t.close(); return t.errors;
}

async function groupRounds() {
  const { t, g, page } = await open();
  await g.freeze(true);
  for (const r of [1, 11, 16, 21, 30]) {
    await g.start(2, r, 40 + r);
    await g.step(40);
    await shot(page, `r${String(r).padStart(2, '0')}_intro_banner`, `round ${r}: ROUND banner (intro, frame 40)`);
    await g.step(70);
    await shot(page, `r${String(r).padStart(2, '0')}_intro_ready`, `round ${r}: READY! (intro, frame 110)`);
    await g.evaluate(() => { fz.Game.debug.god(true); fz.Game.debug.skipIntro(); });
    await play(g, r === 30 ? 360 : 300, true);
    await g.evaluate((r) => { const D = fz.Game.debug; const p = D._S().players[0]; for (const k of ['food_3', 'food_5', 'letter']) D.spawn(k, 60 + Math.random() * 120, 100); }, r);
    await g.step(20);
    await shot(page, `r${String(r).padStart(2, '0')}_play`, `round ${r}: mid-play, 2 players, bubbles / items`);
  }
  console.log('rounds errors', t.errors); await t.close(); return t.errors;
}

async function groupEnemies() {
  const { t, g, page } = await open();
  await g.freeze(true);
  const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  for (const [round, tag] of [[17, 'crystal'], [1, 'coral'], [22, 'volcanic']]) {
    // row of enemies on a flat arena: normal, angry (hurry), frozen (clock)
    for (const mode of ['normal', 'angry', 'frozen']) {
      await g.start(1, round, 3);
      await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); });
      await g.evaluate((types) => {
        const D = fz.Game.debug; const S = D._S();
        types.forEach((k, i) => { D.spawn(k, 40 + i * 36, k === 'jellop' || k === 'glimmer' ? 90 : 120); });
        for (const e of S.enemies) { e.vx = 0; }
      }, types);
      if (mode === 'angry') await g.evaluate(() => { fz.Game.debug.setHurryTimer(fz.LEVELS[fz.Game.debug.state().level - 1].hurry * 60); });
      if (mode === 'frozen') await g.evaluate(() => { fz.Game.debug.give(0, 'clock'); });
      await g.step(mode === 'angry' ? 130 : 6);
      await g.evaluate(() => { for (const e of fz.Game.debug._S().enemies) if (e.state === 'active' || e.state === 'frozen') { e.vx = 0; } });
      await g.step(3);
      await shot(page, `enemies_${tag}_${mode}`, `five enemy types, ${mode}, round ${round} (${tag})`);
    }
  }
  console.log('enemies errors', t.errors); await t.close(); return t.errors;
}

async function groupSpecials() {
  const { t, g, page } = await open();
  await g.freeze(true);
  for (const [k, round] of [['thunder', 12], ['fire', 9], ['water', 6]]) {
    await g.start(1, round, 9);
    await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); D.setPlayer(0, { x: 40, y: 200, vx: 0, vy: 0, face: 1 }); });
    await g.evaluate((k) => { const D = fz.Game.debug; D.spawn('nibbler', 170, 200); D.spawn('crabbit', 200, 120); D.spawn(k, 44, 196); }, k);
    await g.step(4);
    await shot(page, `special_${k}_a`, `${k} bubble just popped (4 frames)`);
    await g.step(10);
    await shot(page, `special_${k}_b`, `${k} effect running (14 frames)`);
    await g.step(24);
    await shot(page, `special_${k}_c`, `${k} effect running (38 frames)`);
  }
  // clock power-up + bomb flash
  await g.start(1, 14, 4);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); D.give(0, 'bomb'); });
  await g.step(2); await shot(page, 'special_bomb_flash', 'star bomb flash');
  console.log('specials errors', t.errors); await t.close(); return t.errors;
}

async function groupHurry() {
  const { t, g, page } = await open();
  await g.freeze(true);
  await g.start(1, 17, 7);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); });
  await g.evaluate(() => fz.Game.debug.setHurryTimer(fz.LEVELS[16].hurry * 60));
  await g.step(30); await shot(page, 'hurry_banner', 'HURRY UP! banner on a crystal round (R17)');
  await g.step(100); await shot(page, 'hurry_angry', 'after the banner: angry enemies (R17)');
  await g.step(520); await shot(page, 'hurry_ghost', 'Bonefin has entered (R17)');
  await g.start(1, 9, 7);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(false); D.noClear(true); D.skipIntro(); });
  await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 120, y: 200 }); fz.Game.debug.spawn('nibbler', 128, 200); });
  await g.step(5); await g.step(30); await shot(page, 'death', 'player death animation');
  await g.start(1, 5, 7);
  await g.evaluate(() => { const D = fz.Game.debug; D._S().players[0].lives = 1; D.god(false); D.skipIntro(); D.spawn('nibbler', D._S().players[0].x, D._S().players[0].y); });
  await g.step(110); await shot(page, 'gameover', 'GAME OVER banner');
  // EXTEND
  await g.start(1, 3, 7);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); const p = D._S().players[0]; p.letters = [true, true, true, true, true, false]; D.spawn('letter', p.x, p.y); });
  await g.step(8); await g.step(30); await shot(page, 'extend', 'EXTEND banner, all six letters lit');
  console.log('hurry errors', t.errors); await t.close(); return t.errors;
}

async function groupBoss() {
  const { t, g, page } = await open();
  await g.freeze(true);
  await g.start(1, 30, 3);
  await g.step(60); await shot(page, 'boss_intro', 'boss intro (HP bar hidden)');
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); });
  await g.step(180); await shot(page, 'boss_fight_full', 'boss fight, full HP bar');
  // fight on: let thunder bubbles rise, hit the boss a few times
  await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find((e) => e.t === 'kraken'); k.hp = 22; k.flashT = 4; });
  await g.step(2); await shot(page, 'boss_hit_flash', 'boss hit flash, HP 22/40');
  await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find((e) => e.t === 'kraken'); k.hp = 14; });
  for (let i = 0; i < 12; i++) { await g.step(40); const s = await g.state(); if (s.enemies.some((e) => e.t === 'kraken') && (await g.evaluate(() => fz.Game.debug._S().proj.length)) >= 3) break; }
  await shot(page, 'boss_angry_ink', 'boss angry (below 50 %) with ink fan in flight');
  // a telegraph frame: find the boss winding up
  await g.start(1, 30, 5);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); });
  for (let i = 0; i < 80; i++) { await g.step(3); const w = await g.evaluate(() => { const k = fz.Game.debug._S().enemies.find((e) => e.t === 'kraken'); return k ? k.inkT : 999; }); if (w <= 12 && w > 4) break; }
  await shot(page, 'boss_ink_telegraph', 'boss ink telegraph (angry face / pulse)');
  await g.evaluate(() => fz.Game.debug.killAll());
  await g.step(40); await shot(page, 'boss_trapped', 'boss defeated: kraken_trapped bubble rising');
  for (let i = 0; i < 300; i++) {
    const s = await g.state(); const kb = s.bubbles.find((b) => b.kind === 'kraken');
    if (kb) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 24, y: y + 24, vy: 0 }), kb.x, kb.y);
    if (s.items.some((it) => it.kind === 'moonpearl')) break;
    await g.step(2);
  }
  await g.step(8); await shot(page, 'boss_pop', 'boss bubble popped (sparkles + pearl dropping)');
  await g.step(80); await shot(page, 'boss_pearl', 'Moon Pearl waiting');
  for (let i = 0; i < 400; i++) {
    const s = await g.state(); const pearl = s.items.find((it) => it.kind === 'moonpearl');
    if (pearl) await g.evaluate((x, y) => fz.Game.debug.setPlayer(0, { x: x + 8, y, vy: 0 }), pearl.x, pearl.y);
    if (s.phase === 'victory') break;
    await g.step(2);
  }
  await g.step(30); await shot(page, 'victory_a', 'victory text (frame 30)');
  await g.step(100); await shot(page, 'victory_b', 'victory text (frame 130)');
  // 2P boss bar
  await g.start(2, 30, 6);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); });
  await g.step(120); await shot(page, 'boss_fight_2p', 'boss fight, 2 players (60 HP pool)');
  console.log('boss errors', t.errors); await t.close(); return t.errors;
}

async function groupEnding() {
  const { t, g, page } = await open();
  await g.freeze(true);
  await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
  for (const f of [60, 300, 600, 900, 1300, 1800, 2400]) {
    const cur = await g.evaluate(() => fz._main.sceneTime());
    if (f > cur) await g.step(f - cur);
    await shot(page, 'ending_' + String(f).padStart(4, '0'), `ending scene, frame ${f}`);
  }
  console.log('ending errors', t.errors); await t.close(); return t.errors;
}

async function groupSheet() {
  const { t, g, page } = await open();
  const url = await page.evaluate(() => { const c = fz_sheet(); return c; function fz_sheet() { const s = window.__fizzpop.GFX.sheet(); const out = document.createElement('canvas'); out.width = s.width * 3; out.height = s.height * 3; const x = out.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, out.width, out.height); return { w: s.width, h: s.height, data: out.toDataURL('image/png') }; } });
  fs.writeFileSync(path.join(OUT, 'gfx_sheet_x3.png'), Buffer.from(url.data.replace(/^data:image\/png;base64,/, ''), 'base64'));
  note('gfx_sheet_x3.png', `GFX.sheet() at scale 3 (${url.w}x${url.h} source)`);
  console.log('sheet errors', t.errors); await t.close(); return t.errors;
}

const groups = [['title', groupTitle], ['phone', groupPhone], ['rounds', groupRounds], ['enemies', groupEnemies], ['specials', groupSpecials], ['hurry', groupHurry], ['boss', groupBoss], ['ending', groupEnding], ['sheet', groupSheet]];
const allErrors = [];
for (const [name, fn] of groups) {
  if (!want(name)) continue;
  try { allErrors.push(...(await fn())); } catch (e) { console.log(`GROUP ${name} THREW: ${e && e.stack || e}`); allErrors.push('group ' + name + ' threw'); }
}
// merge with the index of earlier partial runs (--only) so _index.json always lists every shot on disk
let prev = []; try { prev = JSON.parse(fs.readFileSync(path.join(OUT, '_index.json'), 'utf8')); } catch (e) { /* first run */ }
const merged = [...prev.filter((p) => !index.some((n) => n.file === p.file)), ...index];
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(merged, null, 1));
console.log(`${index.length} screenshots in ${OUT}; ${allErrors.length} errors`);
process.exit(allErrors.length ? 1 : 0);
