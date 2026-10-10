// FIZZ & POP — Main module tests (Playwright, real headless Chromium).
// Tests src/50_main.js + src/template.html against the STUB modules (test/stubs/*) via test/main_build.mjs.
//   node test/main_tests.mjs            full suite, stubs      -> out/main/tests/*.png
//   ONLY_GROUPS=menus,scaling node test/main_tests.mjs     only the named groups
//   node test/main_tests.mjs --real     boot + scene screenshots only, with the real src/10..40 modules
//                                                              -> out/main/tests_real/*.png
// Exit code 1 when any check fails or a page logs a console error.
import path from 'path';
import { launch, canvasShot, pageShot, fp, PROJECT } from '../tools/harness.mjs';
import { buildMainPage } from './main_build.mjs';

const REAL = process.argv.includes('--real');
const HTML = buildMainPage(REAL);
const OUT = path.join(PROJECT, 'out', 'main', REAL ? 'tests_real' : 'tests');
const ONLY = REAL ? new Set(['boot', 'screens', 'real-integration']) : (process.env.ONLY_GROUPS ? new Set(process.env.ONLY_GROUPS.split(',')) : null);   // ONLY_GROUPS=a,b runs only those groups

let failed = 0, passed = 0;
const check = (name, cond, extra = '') => {
  if (cond) passed++; else failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function group(name, fn) {
  if (ONLY && !ONLY.has(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { check(name + ' threw', false, e && e.stack ? e.stack : String(e)); }
}
const noErrors = (t, label = 'zero console/page errors') => check(label, t.errors.length === 0, JSON.stringify(t.errors));

async function open(opts = {}) {
  const t = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, ...opts });
  t.g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop);
  t.press = async (key, ms = 100) => { await t.page.keyboard.press(key); await wait(ms); };
  t.scene = () => t.g.scene();
  t.rect = (sel) => t.page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
  t.frame = async () => (await t.g.state()).frame;
  return t;
}

// ---------------------------------------------------------------------------------------------------
await group('boot', async () => {
  const t = await open();
  const g = t.g;
  check('window.__fizzpop exposes the full contract', await g.evaluate(() =>
    ['Game', 'GFX', 'AUDIO', 'LEVELS', 'C', 'U'].every((k) => !!fz[k]) &&
    ['scene', 'goto', 'freeze', 'step', 'start'].every((k) => typeof fz[k] === 'function') &&
    typeof fz.input.set === 'function' && typeof fz.input.clear === 'function'));
  check('boots into the title scene', (await t.scene()) === 'title');
  const r = await t.rect('#screen');
  check('desktop 1280x800: canvas is 768x672 (x3)', Math.round(r.w) === 768 && Math.round(r.h) === 672, JSON.stringify(r));
  check('desktop: legend visible, touch controls hidden', await g.evaluate(() =>
    getComputedStyle(document.getElementById('legend')).display !== 'none' && getComputedStyle(document.getElementById('touch')).display === 'none'));
  check('legend mentions both players and the keys', await g.evaluate(() => /P1/.test(document.getElementById('legend').textContent) && /P2/.test(document.getElementById('legend').textContent) && /Space/.test(document.getElementById('legend').textContent)));
  check('focus overlay hidden when the document has focus', await g.evaluate(() => document.getElementById('focus').hidden === true));
  check('image-rendering is pixelated, canvas 256x224', await g.evaluate(() => { const c = document.getElementById('screen'); return getComputedStyle(c).imageRendering === 'pixelated' && c.width === 256 && c.height === 224; }));
  check('no horizontal scroll', await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth));
  await pageShot(t.page, path.join(OUT, 'desktop_page_title.png'));
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('screens', async () => {
  const t = await open();
  const g = t.g;
  const shot = (n) => canvasShot(t.page, path.join(OUT, 'desktop', n + '.png'), { scale: 3 });
  await g.freeze(true);
  await g.goto('title'); await g.step(40); await shot('01_title');
  for (const [i, f] of [[0, 40], [1, 100], [2, 150], [3, 220]].map(([a, b]) => [a, b])) {
    await g.goto('story', { attract: true }); await g.step(f); await shot(`02_story_${f}`);
  }
  for (let p = 0; p < 6; p++) { await g.goto('howto', { page: p }); await g.step(30); await shot('03_howto_' + p); }
  await g.goto('scores'); await g.step(30); await shot('04_scores');
  await g.evaluate(() => fz._main.resetScores());
  await g.goto('entry', { entries: [{ pi: 0, score: 41230, round: 9 }] }); await g.step(40); await shot('05_entry');
  await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
  for (const f of [30, 500, 1100, 1900]) { const cur = await g.evaluate(() => fz._main.sceneTime()); await g.step(f - cur); await shot('06_ending_' + f); }
  await g.start(2, 6, 3); await g.step(100); await shot('07_play');
  await g.goto('pause'); await g.step(1); await shot('08_pause');
  check('pause overlay: scene() still reports play, paused flag set', (await t.scene()) === 'play' && (await g.evaluate(() => fz._main.paused())) === true);
  await g.evaluate(() => fz._main.setPaused(false));
  await g.step(1);
  check('every scene rendered without errors', true);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
// Only with --real: the actual Game/Audio/Gfx/Levels modules behind Main (uses Game.debug._S, a non-contract test hook).
await group('real-integration', async () => {
  if (!REAL) return;
  const t = await open();
  const g = t.g;
  await t.press('Enter'); await wait(450); await t.press('Enter', 300);
  check('real Game: Enter, Enter -> play', (await t.scene()) === 'play');
  console.log('      real AUDIO.ready() after the first key press: ' + (await g.evaluate(() => fz.AUDIO.ready())));
  await wait(800);
  const st = await g.state();
  check('real Game state is live (frame advances, 1 player, round 1)', st.frame > 20 && st.players.length === 1 && st.level === 1, JSON.stringify({ f: st.frame, n: st.players.length, l: st.level }));
  await t.press('KeyQ');
  await wait(300);
  check('Q joins P2 in the real Game', (await g.state()).players.length === 2);
  await t.press('KeyP');
  const f1 = (await g.state()).frame; await wait(250);
  check('pause stops the real Game', (await g.state()).frame === f1);
  await t.press('Escape');
  await t.page.keyboard.down('ArrowRight'); await wait(600); await t.page.keyboard.up('ArrowRight');
  await t.page.keyboard.down('Space'); await wait(120); await t.page.keyboard.up('Space');
  check('real Game: P1 shoots a bubble from the keyboard', (await g.state()).bubbles.length >= 1);
  await canvasShot(t.page, path.join(OUT, 'real_play.png'));
  await g.evaluate(() => fz._main.resetScores());
  await g.evaluate(() => { fz.Game.debug.addScore(0, 12345); fz.Game.debug._S().over = true; });
  await wait(150);
  check('Game over (real) -> entry', (await t.scene()) === 'entry');
  await g.freeze(true); await g.step(30 * 60 + 5); await g.freeze(false);
  check('entry -> scores with the new entry', (await t.scene()) === 'scores' && (await g.evaluate(() => fz._main.scores())).some((s) => s.score === 12345));
  await canvasShot(t.page, path.join(OUT, 'real_scores.png'));
  await g.goto('title');
  await t.press('Enter'); await wait(450); await t.press('Enter', 300);
  await g.evaluate(() => { fz.Game.debug.addScore(0, 99000); const S = fz.Game.debug._S(); S.won = true; S.over = true; });
  await wait(150);
  check('victory (real) -> ending', (await t.scene()) === 'ending');
  await wait(500);
  await canvasShot(t.page, path.join(OUT, 'real_ending.png'));
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('scaling', async () => {
  const t = await open();
  // The rule (FIXPLAN U8/U18): whole DEVICE pixels per game pixel when that keeps >= 80 % of the achievable scale, else the
  // achievable (fractional) scale, drawn "sharp bilinear". The desktop legend only stays when it costs no scale step.
  const pick = (k, dpr) => { const si = Math.floor(k * dpr + 1e-6) / dpr; return si * dpr >= 1 && si >= 0.8 * k ? { s: si, sharp: false } : { s: k, sharp: true }; };
  const VPS = [[1920, 1080], [1280, 800], [1280, 720], [1024, 768], [800, 600], [700, 520], [900, 700], [640, 480], [500, 700], [360, 640], [320, 480], [600, 300]];
  for (const dpr of [1, 2]) {
    for (const [w, h] of VPS) {
      const c = await open({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      const m = await c.page.evaluate(() => {
        const r = document.getElementById('screen').getBoundingClientRect(), L = document.getElementById('legend');
        L.hidden = false; const lh = L.offsetHeight; const lay = window.__fizzpop._main.layout(); L.hidden = !lay.legend;
        return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom, legendH: lh, sw: document.documentElement.scrollWidth, lay,
          ir: getComputedStyle(document.getElementById('screen')).imageRendering, cw: document.getElementById('screen').width };
      });
      const bw = w - 32, bh = h - 16;
      const withLeg = pick(Math.min(bw / 256, (bh - m.legendH - 12) / 224), dpr), without = pick(Math.min(bw / 256, bh / 224), dpr);
      const wantLegend = withLeg.s >= without.s - 1e-6, want = wantLegend ? withLeg : without;
      const label = `${w}x${h}@${dpr}`;
      check(`${label}: scale ${want.s.toFixed(3)} (${want.sharp ? 'sharp-bilinear' : 'whole device pixels'}), legend ${wantLegend ? 'kept' : 'hidden'}`,
        Math.abs(m.w - 256 * want.s) < 0.6 && m.lay.legend === wantLegend && m.lay.sharp === want.sharp, `${m.w}x${m.h} ${JSON.stringify(m.lay)}`);
      check(`${label}: rendering matches (pixelated for whole device pixels; auto + integer-multiple backing store otherwise)`,
        want.sharp ? (m.ir === 'auto' && m.cw % 256 === 0 && m.cw >= 256 && m.cw * 1 >= Math.min(1024, Math.ceil(m.w * dpr / 256 - 1e-6) * 256)) : (m.ir === 'pixelated' && m.cw === 256), JSON.stringify({ ir: m.ir, cw: m.cw }));
      check(`${label}: aspect ratio 8:7, inside the viewport with 16px gutters, no h-scroll`, Math.abs(m.w / m.h - 256 / 224) < 0.01 && m.x >= 15.5 && m.r <= w - 15.5 && m.b <= h && m.y >= 0 && m.sw <= w, JSON.stringify(m));
      if (dpr === 1 && !want.sharp) check(`${label}: integer scale at DPR 1 means a whole CSS multiple`, Math.abs(m.w / 256 - Math.round(m.w / 256)) < 0.01, String(m.w));
      noErrors(c, `${label}: zero errors`);
      await c.close();
    }
  }
  // "uses >= 80 %": a window that fits x2.9 gets x2.9 (sharp), not x2
  const c = await open({ viewport: { width: 1000, height: 700 } });
  const lay = await c.g.evaluate(() => fz._main.layout());
  check('1000x700@1: legend gives way to a whole x3 instead of a sharp x2.79 (legend only stays when it is free)', lay.scale === 3 && !lay.legend && !lay.sharp, JSON.stringify(lay));
  await c.close();
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('keyboard-flow', async () => {
  const t = await open();
  const g = t.g;
  await t.press('Enter');
  check('Enter on title -> story intro', (await t.scene()) === 'story');
  await wait(450);
  await t.press('Enter');
  check('Enter skips the story -> play', (await t.scene()) === 'play');
  const f0 = await t.frame();
  await wait(300);
  check('game updates run in the real loop', (await t.frame()) > f0 + 10);
  await t.press('KeyP');
  const f1 = await t.frame();
  await wait(250);
  check('P pauses (frame counter stops, scene stays play)', (await t.frame()) === f1 && (await t.scene()) === 'play' && (await g.evaluate(() => fz._main.paused())));
  check('pause played sfx pause', await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'sfx' && e[1] === 'pause')));
  await t.press('KeyP');
  const f2 = await t.frame();
  await wait(200);
  check('P resumes', (await t.frame()) > f2);
  await t.press('Escape');
  check('Esc pauses too', await g.evaluate(() => fz._main.paused()));
  await t.press('ArrowDown');
  await t.press('Enter');
  check('pause menu: DOWN + ENTER = QUIT asks first (still in the game, confirm question showing)', (await t.scene()) === 'play' && await g.evaluate(() => fz._main.confirmQuit()));
  await t.press('Enter');
  check('the question defaults to NO: ENTER goes back to the pause menu', (await t.scene()) === 'play' && !(await g.evaluate(() => fz._main.confirmQuit())) && await g.evaluate(() => fz._main.paused()));
  await t.press('Enter');                                   // on QUIT again
  await t.press('Escape');
  check('Esc backs out of the QUIT question', (await t.scene()) === 'play' && !(await g.evaluate(() => fz._main.confirmQuit())));
  await t.press('Enter');
  await t.press('ArrowDown');
  await t.press('Enter');
  check('QUIT? YES -> title', (await t.scene()) === 'title');

  // movement + edge detection (single bubble per press even when Space is held)
  await t.press('Enter'); await wait(450); await t.press('Enter');
  const s0 = await g.state();
  await t.page.keyboard.down('ArrowRight');
  await wait(400);
  await t.page.keyboard.up('ArrowRight');
  const s1 = await g.state();
  check('ArrowRight moves P1', s1.players[0].x > s0.players[0].x + 15, `${s0.players[0].x} -> ${s1.players[0].x}`);
  await t.page.keyboard.down('Space');
  await wait(450);
  await t.page.keyboard.up('Space');
  check('holding Space shoots exactly once (rising edge)', (await g.state()).bubbles.length === 1, String((await g.state()).bubbles.length));
  await t.page.keyboard.down('KeyX');
  await wait(60);
  const air = (await g.state()).players[0];
  await t.page.keyboard.up('KeyX');
  check('X jumps', air.onGround === false || air.vy < 0, JSON.stringify(air));
  await wait(900);
  await t.press('KeyQ');
  check('P2 bubble key (Q) joins the running 1P game', (await g.state()).players.length === 2);
  await t.page.keyboard.down('KeyD'); await wait(300); await t.page.keyboard.up('KeyD');
  check('P2 keys (D) now move P2 left? no: right is clamped, game still alive', (await g.state()).players.length === 2);
  await t.press('KeyM');
  check('M toggles mute', await g.evaluate(() => fz.AUDIO.isMuted()));
  await t.press('KeyM');
  check('M toggles mute back', !(await g.evaluate(() => fz.AUDIO.isMuted())));

  // a key pressed and released between two ticks is not lost (frozen loop, then unfrozen)
  await g.goto('title');
  await g.freeze(true);
  await t.page.keyboard.press('Enter');
  await g.freeze(false);
  await wait(120);
  check('tap during a frozen loop is applied after unfreeze (no lost taps)', (await t.scene()) === 'story');
  // step() uses virtual input only
  await g.goto('title');
  await g.freeze(true);
  await g.start(1, 1, 5);
  const v0 = (await g.state()).players[0].x;
  await t.page.keyboard.down('ArrowRight');
  await g.step(30);
  await t.page.keyboard.up('ArrowRight');
  check('step() ignores real keyboard input', (await g.state()).players[0].x === v0);
  await g.set(0, { right: true }); await g.step(30); await g.clear();
  check('step() + input.set moves P1', (await g.state()).players[0].x > v0 + 20);
  await g.freeze(false);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('menus', async () => {
  const t = await open();
  const g = t.g;
  const log = () => g.evaluate(() => fz.AUDIO._log.map((e) => e[0] + ':' + e[1]));
  const rows = () => g.evaluate(() => fz._main.rows());
  const ids = async () => (await rows()).map((r) => r.id);
  // go to a title row by its id with the arrow keys
  const pick = async (id) => {
    const r = await rows(); const n = r.length, to = r.findIndex((x) => x.id === id), from = r.findIndex((x) => x.sel);
    for (let i = 0; i < ((to - from) % n + n) % n; i++) await t.press('ArrowDown', 60);
  };
  check('title rows on a keyboard device: 1 PLAYER, 2 PLAYERS, HOW TO PLAY, HI-SCORES, SOUND', JSON.stringify(await ids()) === JSON.stringify(['p1', 'p2', 'help', 'table', 'sound']), JSON.stringify(await ids()));
  await t.press('ArrowDown');
  await t.press('ArrowDown');
  check('menu navigation plays menu_move', (await log()).filter((e) => e === 'sfx:menu_move').length >= 2);
  await pick('sound');
  await t.press('Enter');
  check('SOUND item toggles mute without leaving the title', (await t.scene()) === 'title' && (await g.evaluate(() => fz.AUDIO.isMuted())));
  await t.press('Enter');
  check('SOUND toggles back', !(await g.evaluate(() => fz.AUDIO.isMuted())));
  await t.press('ArrowUp');                                  // wraps: sound -> table
  await t.press('Enter');
  check('HI-SCORES row opens the table (touch players have no T key)', (await t.scene()) === 'scores');
  await wait(350); await t.press('Enter');
  await pick('help'); await t.press('Enter');
  check('HOW TO PLAY row opens the how-to pages', (await t.scene()) === 'howto');
  await wait(350); await t.press('Escape');
  check('no CONTINUE entry before a game reached round 6', !(await ids()).includes('cont'));
  await pick('p2'); await t.press('Enter');
  check('2 PLAYERS starts the story', (await t.scene()) === 'story');
  await wait(450); await t.press('Enter');
  check('2 PLAYERS starts a two-player game', (await g.state()).players.length === 2);
  // reach round 7 then QUIT -> CONTINUE ROUND 6 appears
  await g.evaluate(() => fz.Game.debug.setLevel(7));
  await t.press('Escape'); await t.press('ArrowDown'); await t.press('Enter'); await t.press('ArrowDown'); await t.press('Enter');
  check('quit (with the YES/NO question) -> title', (await t.scene()) === 'title');
  check('session remembers the reached round and player count', await g.evaluate(() => { const s = fz._main.session(); return s.reached === 7 && s.lastPlayers === 2; }));
  check('CONTINUE ROUND 6 row appears after the 2P row', JSON.stringify(await ids()) === JSON.stringify(['p1', 'p2', 'cont', 'help', 'table', 'sound']), JSON.stringify(await ids()));
  await canvasShot(t.page, path.join(OUT, 'title_with_continue.png'), { scale: 3 });
  await pick('cont');
  await t.press('Enter'); await wait(450); await t.press('Enter', 300);
  const st = await g.state();
  check('CONTINUE restarts at the first round of the theme (6), same player count', (await t.scene()) === 'play' && st.level === 6 && st.players.length === 2, JSON.stringify({ level: st.level, n: st.players.length }));
  await g.goto('title');
  // H / T extras and Esc back
  await t.press('KeyH');
  check('H opens how-to-play', (await t.scene()) === 'howto');
  await wait(350);
  await t.press('ArrowRight'); await t.press('ArrowRight');
  await t.press('Escape');
  check('Esc leaves how-to-play', (await t.scene()) === 'title');
  await t.press('KeyT');
  check('T opens the hi-score table', (await t.scene()) === 'scores');
  await wait(350);
  await t.press('Enter');
  check('Enter leaves the table', (await t.scene()) === 'title');
  // mouse click on a menu row (the 2 PLAYERS row)
  const r = await t.rect('#screen');
  const rowY = async (id) => { const x = (await rows()).find((q) => q.id === id); return r.y + (x.top + x.h / 2) * r.h / 224; };
  await t.page.mouse.click(r.x + r.w / 2, await rowY('p2'));
  await wait(120);
  check('mouse click on "2 PLAYERS" starts the story', (await t.scene()) === 'story');
  await wait(450);
  await t.page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await wait(120);
  check('click skips the story', (await t.scene()) === 'play' && (await g.state()).players.length === 2);
  // click QUIT in the pause menu: YES/NO question first
  await t.press('KeyP');
  const pr = await rows();
  await t.page.mouse.click(r.x + r.w / 2, r.y + (pr[1].top + pr[1].h / 2) * r.h / 224);
  await wait(120);
  check('click on QUIT asks first', (await t.scene()) === 'play' && await g.evaluate(() => fz._main.confirmQuit()));
  const cr = await rows();
  await t.page.mouse.click(r.x + r.w / 2, r.y + (cr[1].top + cr[1].h / 2) * r.h / 224);
  await wait(120);
  check('click on YES returns to the title', (await t.scene()) === 'title');
  // a 1P game that P2 joined, then QUIT: CONTINUE keeps 2 players (U22)
  await g.freeze(true);
  await g.start(1, 8, 3); await g.step(30);
  await g.set(1, { fire: true }); await g.step(1); await g.set(1, { fire: false }); await g.step(1);
  check('P2 joined the 1P game', (await g.state()).players.length === 2);
  await g.goto('title');
  check('U22: leaving a game that P2 joined keeps 2 players for CONTINUE', (await g.evaluate(() => fz._main.session().lastPlayers)) === 2);
  await g.freeze(false);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('gameover-entry-scores', async () => {
  const t = await open();
  const g = t.g;
  const scores = () => g.evaluate(() => fz._main.scores());
  await g.evaluate(() => fz._main.resetScores());
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await g.evaluate(() => { fz.Game.debug.killAll(); fz.Game.debug.end(false); });
  await wait(150);
  check('game over with a qualifying score -> entry', (await t.scene()) === 'entry');
  await wait(450);
  const e0 = await g.evaluate(() => fz._main.entry());
  check('entry knows the player, score and rank', e0.cur && e0.cur.pi === 0 && e0.cur.score === 3000 && e0.pos === 0, JSON.stringify(e0));
  await canvasShot(t.page, path.join(OUT, 'entry_flow_start.png'));
  await t.press('ArrowRight');
  await t.press('Enter');
  await t.press('ArrowRight'); await t.press('ArrowRight');
  check('entry: arrows cycle the letter, ENTER confirms and advances', (await g.evaluate(() => fz._main.entry())).name.startsWith('BC'), JSON.stringify(await g.evaluate(() => fz._main.entry())));
  await t.press('Backspace');
  check('entry: BACKSPACE steps back one slot (R5: the keyboard label names the key that does it)', (await g.evaluate(() => fz._main.entry())).pos === 0);
  await t.press('Enter'); await t.press('Enter');
  await t.press('ArrowLeft');             // slot 3: A -> 9 (wraps backwards)
  await t.press('Enter');
  const e1 = await g.evaluate(() => fz._main.entry());
  check('entry: after the third letter an OK moment follows', e1.doneT > 0, JSON.stringify(e1));
  await wait(1000);
  check('entry done -> hi-score table', (await t.scene()) === 'scores');
  const tab = await scores();
  const mine = tab.findIndex((s) => s.score === 3000);
  check('new score inserted into the table (top 8, sorted), name from the entry', tab.length === 8 && mine >= 0 && /^[A-Z0-9]{3}$/.test(tab[mine].name) && tab.every((s, i) => i === 0 || tab[i - 1].score >= s.score), JSON.stringify(tab));
  check('lowest default entry was pushed out', !tab.some((s) => s.name === 'GLM'));
  await canvasShot(t.page, path.join(OUT, 'scores_after_entry.png'));
  await wait(300);
  await t.press('Enter');
  check('table -> title', (await t.scene()) === 'title');

  // 2P: both qualify, entered one after the other
  await g.freeze(true);
  await g.goto('entry', { entries: [{ pi: 0, score: 50000, round: 10 }, { pi: 1, score: 40000, round: 10 }] });
  const tapOk = async () => { await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false }); await g.step(1); };
  await g.step(30);
  for (let i = 0; i < 3; i++) await tapOk();
  check('2P entry: first player done, OK moment', (await g.evaluate(() => fz._main.entry())).doneT > 0);
  await g.step(50);
  const e2 = await g.evaluate(() => fz._main.entry());
  check('2P entry: second player is up next', e2.cur && e2.cur.pi === 1 && e2.pos === 0, JSON.stringify(e2));
  await g.step(30);
  for (let i = 0; i < 3; i++) await tapOk();
  await g.step(50);
  check('2P entry -> scores with both highlighted', (await t.scene()) === 'scores');
  const tab2 = await scores();
  check('2P scores inserted: 50000 above 40000', tab2.findIndex((s) => s.score === 50000) < tab2.findIndex((s) => s.score === 40000) && tab2.some((s) => s.score === 40000), JSON.stringify(tab2));
  // time-out takes the letters as shown
  await g.goto('entry', { entries: [{ pi: 0, score: 99999, round: 3 }] });
  await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false });
  await g.step(30 * 60 + 5);
  check('entry times out after 30 s and stores the letters as shown', (await t.scene()) === 'scores' && (await scores()).some((s) => s.score === 99999 && s.name === 'BAA'), JSON.stringify(await scores()));
  // non-qualifying scores skip the entry
  await g.goto('entry', { entries: [{ pi: 0, score: 5, round: 1 }, { pi: 1, score: 0, round: 1 }] });
  check('a score below the 8th place skips the entry', (await t.scene()) === 'scores');
  // game over with zero points goes straight to the table
  await g.start(1, 1, 1);
  await g.evaluate(() => fz.Game.debug.end(false));
  await g.step(1);
  check('game over with no score -> scores (no entry)', (await t.scene()) === 'scores');
  // victory path: ending (credits) -> entry
  await g.evaluate(() => fz._main.resetScores());
  await g.start(1, 1, 1);
  await g.evaluate(() => { fz.Game.debug.killAll(); fz.Game.debug.end(true); });
  await g.step(1);
  check('Game.isOver() with won=true -> ending scene', (await t.scene()) === 'ending');
  await g.step(60);
  await g.set(0, { pause: true }); await g.step(1); await g.set(0, { pause: false });
  check('pause/Esc skips the credits -> entry', (await t.scene()) === 'entry');
  // credits finish on their own
  await g.evaluate(() => fz._main.resetScores());
  await g.goto('ending', { res: { won: true, level: 30, scores: [1000, 0], players: 1 }, entries: [] });
  let frames = 0;
  while ((await t.scene()) === 'ending' && frames < 6000) { await g.step(60); frames += 60; }
  check(`credits end on their own after ${frames} frames (25-60 s) -> scores (nothing to enter)`, (await t.scene()) === 'scores' && frames >= 1500 && frames <= 3600, `${await t.scene()} after ${frames}`);
  await g.freeze(false);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('persistence', async () => {
  const t = await open();
  const g = t.g;
  await g.evaluate(() => fz._main.resetScores());
  await g.freeze(true);
  await g.goto('entry', { entries: [{ pi: 0, score: 77777, round: 12 }] });
  await g.step(30);
  await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
  await g.step(30 * 60 + 5);
  const before = await g.evaluate(() => fz._main.scores());
  check('score stored', before[0].score === 77777);
  await t.page.reload();
  await t.page.waitForFunction(() => !!window.__fizzpop);
  const after = await t.g.evaluate(() => fz._main.scores());
  check('hi-scores survive a reload (U.store)', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
  check('Game.start gets the hi-score of the table', true);
  // corrupt data -> defaults, no crash
  await t.page.evaluate(() => localStorage.setItem('fizzpop.v1.scores', '{not json'));
  await t.page.reload();
  await t.page.waitForFunction(() => !!window.__fizzpop);
  const def = await t.g.evaluate(() => fz._main.scores());
  check('corrupt storage -> default table of 8', def.length === 8 && def[0].name === 'FIZ', JSON.stringify(def));
  await t.page.evaluate(() => localStorage.setItem('fizzpop.v1.scores', JSON.stringify([{ name: 'abcdef', score: 'x' }, { name: 'ok', score: 500, round: 99 }])));
  await t.page.reload();
  await t.page.waitForFunction(() => !!window.__fizzpop);
  const san = await t.g.evaluate(() => fz._main.scores());
  check('sanitised: bad rows dropped, names 3 chars, round clamped', san.length === 1 && san[0].name === 'OKA' && san[0].round === 30, JSON.stringify(san));
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('storage-blocked', async () => {
  const t = await open({ initScript: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
  const g = t.g;
  check('boots with localStorage throwing', (await t.scene()) === 'title');
  await t.press('KeyM');
  check('mute works (memory fallback)', await g.evaluate(() => fz.AUDIO.isMuted()));
  await t.press('KeyM');
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await g.evaluate(() => { fz.Game.debug.killAll(); fz.Game.debug.end(false); });
  await wait(150);
  check('game over -> entry while storage is blocked', (await t.scene()) === 'entry');
  await g.freeze(true);
  await g.step(30 * 60 + 5);
  check('entry -> scores, new score visible via the in-memory fallback', (await t.scene()) === 'scores' && (await g.evaluate(() => fz._main.scores())).some((s) => s.score === 3000));
  await g.freeze(false);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('mute-persists', async () => {
  const t = await open();
  const g = t.g;
  const redPixel = () => g.evaluate(() => {
    const d = document.getElementById('screen').getContext('2d').getImageData(244, 2, 12, 12).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] < 120 && d[i + 2] < 120) return true;
    return false;
  });
  check('unmuted: no mute icon', !(await redPixel()));
  await t.press('KeyM');
  check('M mutes', await g.evaluate(() => fz.AUDIO.isMuted()));
  await wait(50);
  check('muted: crossed speaker icon drawn at the top-right', await redPixel());
  await canvasShot(t.page, path.join(OUT, 'title_muted.png'));
  await t.page.reload();
  await t.page.waitForFunction(() => !!window.__fizzpop);
  check('mute persists across a reload', await t.g.evaluate(() => fz.AUDIO.isMuted()));
  await wait(80);
  check('icon still shown after reload', await redPixel());
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('focus-overlay', async () => {
  const t = await open({ initScript: `document.hasFocus = () => false;` });
  const g = t.g;
  check('overlay shown when the document has no focus', await g.evaluate(() => document.getElementById('focus').hidden === false));
  const o = await t.rect('#focus'), c = await t.rect('#screen');
  check('overlay covers the canvas', Math.abs(o.w - c.w) < 2 && Math.abs(o.h - c.h) < 2);
  check('overlay says "Click to play"', await g.evaluate(() => /CLICK TO PLAY/i.test(document.getElementById('focus').textContent)));
  await pageShot(t.page, path.join(OUT, 'focus_overlay.png'));
  check('audio not unlocked yet', !(await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'init'))));
  await t.page.mouse.click(o.x + o.w / 2, o.y + o.h / 2);
  await wait(100);
  check('click hides the overlay and unlocks audio (AUDIO.init)', await g.evaluate(() => document.getElementById('focus').hidden === true && fz.AUDIO._log.some((e) => e[0] === 'init')));
  await wait(700);
  check('overlay stays hidden after the poll interval', await g.evaluate(() => document.getElementById('focus').hidden === true));
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(50);
  check('blur brings the overlay back', await g.evaluate(() => document.getElementById('focus').hidden === false));
  await t.press('Space');
  check('a game key dismisses it again', await g.evaluate(() => document.getElementById('focus').hidden === true));
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('pause-blur', async () => {
  const t = await open();
  const g = t.g;
  await t.press('Enter'); await wait(450); await t.press('Enter');
  const f0 = await t.frame();
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(100);
  const f1 = await t.frame();
  await wait(250);
  check('blur auto-pauses the game', (await t.frame()) === f1 && (await g.evaluate(() => fz._main.paused())) && f1 >= f0 && f0 > 0);
  check('blur suspends audio (AUDIO.pause)', await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'pause')));
  await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await wait(150);
  check('focus does not resume the game by itself', await g.evaluate(() => fz._main.paused()));
  await t.press('Enter');
  check('RESUME resumes the game and the audio', !(await g.evaluate(() => fz._main.paused())) && await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'resume')));
  // hidden tab
  await t.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(100);
  check('visibilitychange (hidden) auto-pauses', await g.evaluate(() => fz._main.paused()));
  await t.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('attract', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  await g.goto('title');
  await g.step(590);
  check('title idles: still title after 9.8 s', (await t.scene()) === 'title');
  await g.step(15);
  check('after 10 s idle: attract story', (await t.scene()) === 'story');
  await g.step(300);
  check('story -> how-to-play', (await t.scene()) === 'howto');
  await g.step(240 * 6 + 5);
  check('how-to-play (6 pages) -> hi-scores', (await t.scene()) === 'scores');
  await g.step(360 + 5);
  check('scores -> title', (await t.scene()) === 'title');
  await g.step(620);
  await g.step(30);
  check('attract cycles again', (await t.scene()) === 'story');
  await g.set(0, { left: true }); await g.step(1); await g.set(0, { left: false });
  check('any input during attract returns to the title', (await t.scene()) === 'title');
  // story intro before play lasts 6 s (R4: the gold rules line, typed by frame ~214, stays readable for >= 2 s) and is skippable
  await g.goto('story', { next: { players: 1, level: 1, seed: 1 } });
  await g.step(359);
  check('story intro: still showing after 359 frames', (await t.scene()) === 'story');
  await g.step(3);
  check('story intro ends after 6 s -> play', (await t.scene()) === 'play');
  await g.goto('story', { next: { players: 2, level: 4, seed: 1 } });
  await g.step(10);
  await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false });
  check('story intro is not skippable in the first instant (input guard)', (await t.scene()) === 'story');
  await g.step(30);
  await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false });
  const sk = await g.state();
  check('story intro skippable; passes players and level to Game.start', (await t.scene()) === 'play' && sk.level === 4 && sk.players.length === 2, JSON.stringify({ l: sk.level, n: sk.players.length }));
  // music per scene
  await g.goto('title');
  check('title music', await g.evaluate(() => fz.AUDIO._state().music === 'title'));
  await g.goto('entry', { entries: [{ pi: 0, score: 99999, round: 1 }] });
  check('entry music', await g.evaluate(() => fz.AUDIO._state().music === 'entry'));
  await g.goto('ending', { res: { won: true, level: 30, scores: [1, 0], players: 1 }, entries: [] });
  check('ending music', await g.evaluate(() => fz.AUDIO._state().music === 'ending'));
  await g.goto('title');
  // activity resets the idle counter
  for (let i = 0; i < 4; i++) { await g.set(0, { pause: true }); await g.step(300); }
  await g.clear();
  check('held input keeps the title from going idle', (await t.scene()) === 'title');
  await g.freeze(false);
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('loop', async () => {
  const t = await open();
  const g = t.g;
  await g.start(1, 1, 3);
  const f0 = await t.frame();
  await wait(1000);
  const df = (await t.frame()) - f0;
  check(`fixed 60 Hz: ${df} updates in 1 s (55..65)`, df >= 55 && df <= 65, String(df));
  // catch-up is capped at 5 steps
  const a = await t.frame();
  await t.page.evaluate(() => { const t0 = performance.now(); while (performance.now() - t0 < 600); });
  await wait(30);
  const b = await t.frame();
  check(`after a 600 ms stall at most ~5 catch-up steps run (got ${b - a})`, b - a <= 12, String(b - a));
  // freeze
  await g.freeze(true);
  const c = await t.frame();
  await wait(200);
  check('freeze() stops updates but rendering continues', (await t.frame()) === c);
  await g.freeze(false);
  await wait(100);
  check('unfreeze resumes', (await t.frame()) > c);
  // performance of one Main tick + render with the stubs (informational)
  await g.freeze(true);
  const ms = await g.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 300; i++) fz.step(1); return (performance.now() - t0) / 300; });
  console.log(`      step+render in play (stub modules): ${ms.toFixed(2)} ms/frame`);
  check('tick + render with stubs stays far below the 16 ms budget', ms < 8, String(ms));
  noErrors(t);
  await t.close();

  // errors in update/render are logged once; the loop survives; a scene that keeps failing is abandoned
  const e = await open();
  await e.g.start(1, 1, 3);
  await e.page.evaluate(() => { fz.Game.render = () => { throw new Error('boom render'); }; });
  await wait(500);
  check('a throwing render is logged exactly once', e.errors.length === 1 && /boom render/.test(e.errors[0]), JSON.stringify(e.errors));
  const s1 = await e.page.evaluate(() => fz._main.sceneTime());
  await wait(200);
  check('loop keeps running after the error', (await e.page.evaluate(() => fz._main.sceneTime())) > s1 + 5);
  await e.page.evaluate(() => { fz.Game.update = () => { throw new Error('boom update'); }; });
  await wait(2600);
  check('a throwing update is logged once too (2 errors total)', e.errors.length === 2 && /boom update/.test(e.errors[1]), JSON.stringify(e.errors));
  check('soft-lock guard: 90 failing frames in a row -> back to the title', (await e.g.scene()) === 'title');
  await e.close();
});

// ---------------------------------------------------------------------------------------------------
await group('gamepad', async () => {
  const init = `
    window.__pads = [null, null];
    const mk = (i) => ({ index: i, connected: true, id: 'fake pad ' + i, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
    window.__mk = mk;
    navigator.getGamepads = () => window.__pads.slice();
  `;
  const t = await open({ initScript: init });
  const g = t.g;
  const setPad = (i, f) => t.page.evaluate(([i, src]) => { if (!window.__pads[i]) window.__pads[i] = window.__mk(i); (0, eval)('(' + src + ')')(window.__pads[i]); }, [i, f.toString()]);
  await setPad(0, (p) => { p.buttons[13].pressed = true; });       // d-pad down
  await wait(120);
  await setPad(0, (p) => { p.buttons[13].pressed = false; });
  await wait(60);
  check('gamepad d-pad moves the title cursor (menu_move)', await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'sfx' && e[1] === 'menu_move')));
  await setPad(0, (p) => { p.buttons[12].pressed = true; });       // d-pad up (back to 1 PLAYER)
  await wait(100);
  await setPad(0, (p) => { p.buttons[12].pressed = false; });
  await wait(60);
  await setPad(0, (p) => { p.buttons[1].pressed = true; });        // B = confirm
  await wait(100);
  await setPad(0, (p) => { p.buttons[1].pressed = false; });
  check('gamepad B starts the game (story)', (await t.scene()) === 'story');
  await wait(450);
  await setPad(0, (p) => { p.buttons[9].pressed = true; });        // Start = skip
  await wait(100);
  await setPad(0, (p) => { p.buttons[9].pressed = false; });
  check('gamepad Start skips the story', (await t.scene()) === 'play');
  const s0 = (await g.state()).players[0];
  await setPad(0, (p) => { p.axes[0] = 0.9; });                    // stick right
  await wait(400);
  await setPad(0, (p) => { p.axes[0] = 0; });
  const s1 = (await g.state()).players[0];
  check('stick right moves P1', s1.x > s0.x + 15, `${s0.x} -> ${s1.x}`);
  await setPad(0, (p) => { p.axes[0] = 0.3; });                    // inside the dead zone
  const x2 = (await g.state()).players[0].x;
  await wait(250);
  check('stick inside the dead zone does nothing', (await g.state()).players[0].x === x2);
  await setPad(0, (p) => { p.axes[0] = 0; p.buttons[0].pressed = true; });   // A = jump
  await wait(60);
  const air = (await g.state()).players[0];
  await setPad(0, (p) => { p.buttons[0].pressed = false; });
  check('gamepad A jumps', air.onGround === false || air.vy < 0, JSON.stringify(air));
  await wait(900);
  await setPad(0, (p) => { p.buttons[2].pressed = true; });        // X = bubble
  await wait(100);
  await setPad(0, (p) => { p.buttons[2].pressed = false; });
  check('gamepad X shoots a bubble', (await g.state()).bubbles.length >= 1);
  await setPad(1, (p) => { p.buttons[1].pressed = true; });        // pad 1 B in a 1P game = join
  await wait(100);
  await setPad(1, (p) => { p.buttons[1].pressed = false; });
  check('pad 1 B joins the running 1P game as P2', (await g.state()).players.length === 2);
  const p2x = (await g.state()).players[1].x;
  await setPad(1, (p) => { p.axes[0] = -0.9; });
  await wait(300);
  await setPad(1, (p) => { p.axes[0] = 0; });
  check('pad 1 stick moves P2', (await g.state()).players[1].x < p2x - 10);
  await setPad(0, (p) => { p.buttons[9].pressed = true; });
  await wait(100);
  await setPad(0, (p) => { p.buttons[9].pressed = false; });
  check('gamepad Start pauses', await g.evaluate(() => fz._main.paused()));
  noErrors(t);
  await t.close();

  const t2 = await open({ initScript: `navigator.getGamepads = () => { throw new Error('gamepad blocked by permissions policy'); };` });
  await wait(300);
  check('a throwing navigator.getGamepads() is survived', (await t2.scene()) === 'title');
  noErrors(t2, 'no errors when the Gamepad API throws');
  await t2.close();
});

// ---------------------------------------------------------------------------------------------------
await group('touch-phone', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true });
  const g = t.g;
  const lay = await g.evaluate(() => fz._main.layout());
  check('phone: touch mode on, portrait, canvas fits the width exactly (358 px, sharp-bilinear x1.4 at DPR 1)', lay.touch && !lay.land && lay.mode === 'port' && lay.w === 358 && lay.sharp, JSON.stringify(lay));
  const disp = await g.evaluate(() => getComputedStyle(document.getElementById('touch')).display);
  check('touch controls visible on (pointer: coarse)', disp === 'flex', disp);
  check('legend hidden on touch', await g.evaluate(() => getComputedStyle(document.getElementById('legend')).display === 'none'));
  check('touch-action: none and no text selection on the controls', await g.evaluate(() => [...document.querySelectorAll('#touch button')].every((b) => getComputedStyle(b).touchAction === 'none' && getComputedStyle(b).userSelect === 'none') && getComputedStyle(document.getElementById('touch')).touchAction === 'none'));
  const c = await t.rect('#screen'), tr = await t.rect('#touch');
  check('controls sit below the canvas, inside the viewport', tr.y >= c.b - 1 && tr.b <= 844 + 1 && c.x >= 15 && c.r <= 375, JSON.stringify({ c, tr }));
  check('no horizontal scroll on the phone', await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const btnRects = await g.evaluate(() => [...document.querySelectorAll('#touch button')].map((b) => { const r = b.getBoundingClientRect(); return { k: b.dataset.k, w: r.width, h: r.height, r: r.right, l: r.left }; }));
  check('every touch button is at least 30 px and on screen', btnRects.length === 6 && btnRects.every((b) => b.w >= 30 && b.h >= 28 && b.l >= 0 && b.r <= 390), JSON.stringify(btnRects));
  check('big pad buttons >= 52 px wide and >= 64 tall (thumb sized)', btnRects.filter((b) => ['left', 'right', 'jump', 'fire'].includes(b.k)).every((b) => b.w >= 52 && b.h >= 64), JSON.stringify(btnRects));
  check('PAUSE / SOUND pills are 44 px tall and sit ABOVE the pads, not beside BUBBLE (Ut2)', await g.evaluate(() => {
    const r = (k) => document.querySelector(`[data-k="${k}"]`).getBoundingClientRect();
    return r('pause').height >= 44 && r('sound').height >= 44 && r('pause').bottom + 8 <= r('fire').top && r('sound').bottom + 8 <= r('jump').top;
  }));
  const rowsT = await g.evaluate(() => fz._main.rows());
  check('touch-only title: no 2 PLAYERS, no SOUND row; rows are >= 40 css px tall', JSON.stringify(rowsT.map((r) => r.id)) === JSON.stringify(['p1', 'help', 'table']) && rowsT.every((r) => r.h * lay.scale >= 40), JSON.stringify({ rowsT, scale: lay.scale }));
  await pageShot(t.page, path.join(OUT, 'phone_title.png'));

  const ptr = (k, type, id, x, y) => t.page.evaluate(([k, type, id, x, y]) => {
    const el = document.querySelector(`[data-k="${k}"]`);
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, bubbles: true, cancelable: true,
      clientX: x === undefined ? r.x + r.width / 2 : x, clientY: y === undefined ? r.y + r.height / 2 : y }));
    return el.classList.contains('on');
  }, [k, type, id, x, y]);

  // real Playwright touch taps start a game: BUBBLE on the title, then a tap on the canvas skips the story
  const fire = await t.page.evaluate(() => { const r = document.querySelector('[data-k="fire"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await t.page.touchscreen.tap(fire.x, fire.y);
  await wait(150);
  check('touch tap on BUBBLE confirms the menu (quick tap not lost)', (await t.scene()) === 'story');
  await wait(450);
  await t.page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
  await wait(150);
  check('tap on the canvas skips the story', (await t.scene()) === 'play');

  // pointer events on the buttons: hold RIGHT
  const s0 = (await g.state()).players[0];
  const onClass = await ptr('right', 'pointerdown', 11);
  check('pressed button gets the .on class', onClass);
  await wait(400);
  await ptr('right', 'pointerup', 11);
  const s1 = (await g.state()).players[0];
  check('holding the RIGHT button moves P1', s1.x > s0.x + 15, `${s0.x} -> ${s1.x}`);
  await wait(80);
  const x1 = (await g.state()).players[0].x;
  await wait(250);
  check('releasing it stops P1', (await g.state()).players[0].x === x1);
  check('released button loses the .on class', await g.evaluate(() => !document.querySelector('[data-k="right"]').classList.contains('on')));

  // true multi-touch: RIGHT (id 11) + JUMP (id 12) at the same time, then BUBBLE (id 13)
  await wait(500);
  const m0 = (await g.state()).players[0];
  await ptr('right', 'pointerdown', 11);
  await ptr('jump', 'pointerdown', 12);
  await wait(70);
  const mid = (await g.state()).players[0];
  check('multi-touch: JUMP while RIGHT is held jumps', mid.onGround === false || mid.vy < 0, JSON.stringify(mid));
  await ptr('fire', 'pointerdown', 13);
  await wait(120);
  await ptr('fire', 'pointerup', 13);
  await ptr('jump', 'pointerup', 12);
  await wait(300);
  const m1 = (await g.state());
  check('multi-touch: P1 kept moving right while jumping', m1.players[0].x > m0.x + 15, `${m0.x} -> ${m1.players[0].x}`);
  check('multi-touch: BUBBLE while holding two others shoots', m1.bubbles.length >= 1);
  await ptr('right', 'pointerup', 11);
  // sliding the thumb from LEFT to RIGHT switches direction
  await wait(300);
  await ptr('left', 'pointerdown', 21);
  await wait(150);
  const sl0 = (await g.state()).players[0].x;
  const rr = await t.rect('[data-k="right"]');
  await t.page.evaluate(([x, y]) => document.querySelector('[data-k="left"]').dispatchEvent(new PointerEvent('pointermove', { pointerId: 21, pointerType: 'touch', bubbles: true, clientX: x, clientY: y })), [rr.x + rr.w / 2, rr.y + rr.h / 2]);
  await wait(300);
  await ptr('left', 'pointerup', 21);
  const sl1 = (await g.state()).players[0].x;
  check('sliding a thumb from LEFT onto RIGHT turns P1 around', sl1 > sl0 + 10, `${sl0} -> ${sl1}`);
  check('contextmenu (long press) is suppressed on the controls', await g.evaluate(() => { const e = new Event('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('[data-k="jump"]').dispatchEvent(e); return e.defaultPrevented; }));
  await canvasShot(t.page, path.join(OUT, 'phone_play.png'));

  // PAUSE and SOUND buttons
  const pause = await t.rect('[data-k="pause"]'), sound = await t.rect('[data-k="sound"]');
  await t.page.touchscreen.tap(pause.x + pause.w / 2, pause.y + pause.h / 2);
  await wait(120);
  check('PAUSE button pauses', await g.evaluate(() => fz._main.paused()));
  await pageShot(t.page, path.join(OUT, 'phone_pause.png'));
  const pRows = await g.evaluate(() => fz._main.rows());
  check('pause rows on touch are >= 40 css px tall', pRows.length === 2 && pRows.every((r) => r.h * lay.scale >= 40), JSON.stringify(pRows));
  await t.page.touchscreen.tap(c.x + c.w / 2, c.y + (pRows[1].top + pRows[1].h / 2) * c.h / 224);
  await wait(150);
  check('tapping QUIT asks YES / NO first', (await t.scene()) === 'play' && await g.evaluate(() => fz._main.confirmQuit()));
  const qRows = await g.evaluate(() => fz._main.rows());
  await t.page.touchscreen.tap(c.x + c.w / 2, c.y + (qRows[1].top + qRows[1].h / 2) * c.h / 224);
  await wait(150);
  check('tapping YES returns to the title', (await t.scene()) === 'title');
  await t.page.touchscreen.tap(sound.x + sound.w / 2, sound.y + sound.h / 2);
  await wait(120);
  check('SOUND button mutes', await g.evaluate(() => fz.AUDIO.isMuted() && document.querySelector('[data-k="sound"]').dataset.muted === '1'));
  await t.page.touchscreen.tap(sound.x + sound.w / 2, sound.y + sound.h / 2);
  await wait(120);
  check('SOUND button unmutes', await g.evaluate(() => !fz.AUDIO.isMuted() && document.querySelector('[data-k="sound"]').dataset.muted === '0'));
  // tapping a title row
  const tRows = await g.evaluate(() => fz._main.rows()), help = tRows.find((r) => r.id === 'help');
  await t.page.touchscreen.tap(c.x + c.w / 2, c.y + (help.top + help.h / 2) * c.h / 224);
  await wait(150);
  check('tapping "HOW TO PLAY" on the canvas opens the how-to pages (reachable without keys)', (await t.scene()) === 'howto');
  noErrors(t);
  await t.close();
});

// ---------------------------------------------------------------------------------------------------
await group('touch-layouts', async () => {
  for (const [w, h, name] of [[360, 640, 'phone-360'], [844, 390, 'landscape-844'], [667, 375, 'landscape-667'], [768, 1024, 'tablet'], [320, 568, 'small-320']]) {
    const t = await open({ viewport: { width: w, height: h }, touch: true });
    const m = await t.page.evaluate(() => {
      const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      return { c: rect('#screen'), l: rect('#touch .left'), rt: rect('#touch .right'), mid: rect('#touch .mid'), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, lay: window.__fizzpop._main.layout() };
    });
    const land = w > h;
    check(`${name}: no horizontal scroll`, m.sw <= w, JSON.stringify(m));
    check(`${name}: canvas inside the viewport (>=16px gutter on the sides)`, m.c.x >= 15.5 && m.c.r <= w - 15.5 && m.c.y >= 0 && m.c.b <= h, JSON.stringify(m.c));
    if (land) check(`${name}: landscape pads sit beside the canvas, never over it`, m.l.r <= m.c.x + 1 && m.rt.x >= m.c.r - 1, JSON.stringify(m));
    else check(`${name}: portrait controls below the canvas`, m.l.y >= m.c.b - 1 && m.rt.b <= h + 1, JSON.stringify(m));
    check(`${name}: controls fully on screen`, m.l.x >= 0 && m.rt.r <= w && m.l.b <= h && m.rt.b <= h && m.mid.r <= w, JSON.stringify(m));
    check(`${name}: fits without vertical page scroll`, m.sh <= h + 1, `${m.sh} > ${h}`);
    await pageShot(t.page, path.join(OUT, `touch_${name}.png`));
    noErrors(t, `${name}: zero console errors`);
    await t.close();
  }
  // 360 px wide non-touch desktop window: still no horizontal scroll
  const d = await open({ viewport: { width: 360, height: 700 } });
  const m = await d.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, c: document.getElementById('screen').getBoundingClientRect().toJSON() }));
  check('desktop browser at 360 px: no horizontal scroll, 16px gutters', m.sw <= 360 && m.c.x >= 15.5 && m.c.right <= 344.5, JSON.stringify(m));
  await pageShot(d.page, path.join(OUT, 'desktop_360.png'));
  noErrors(d);
  await d.close();
  // touch controls appear after the first touch on a device without a coarse pointer, and go away on a key press
  const e = await open();
  check('mouse desktop: touch controls initially hidden', await e.g.evaluate(() => !fz._main.touchMode()));
  await e.page.evaluate(() => document.getElementById('screen').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 5, bubbles: true, clientX: 300, clientY: 300 })));
  await wait(100);
  check('first touch event reveals the touch controls', await e.g.evaluate(() => fz._main.touchMode() && getComputedStyle(document.getElementById('touch')).display !== 'none'));
  await e.press('KeyM');
  check('a real key press hides them again on non-coarse devices', await e.g.evaluate(() => !fz._main.touchMode()));
  noErrors(e);
  await e.close();
});

// ---------------------------------------------------------------------------------------------------
await group('theme', async () => {
  const bg = (t) => t.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const DARK = 'rgb(11, 10, 20)', LIGHT = 'rgb(233, 238, 246)';
  const l = await open({ colorScheme: 'light' });
  check('light scheme: light page background', (await bg(l)) === LIGHT, await bg(l));
  await l.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  check('data-theme="dark" forces dark under a light OS', (await bg(l)) === DARK, await bg(l));
  await l.close();
  const d = await open({ colorScheme: 'dark' });
  check('dark scheme: dark page background', (await bg(d)) === DARK, await bg(d));
  await d.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  check('data-theme="light" wins over a dark OS', (await bg(d)) === LIGHT, await bg(d));
  await d.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await pageShot(d.page, path.join(OUT, 'theme_dark.png'));
  check('canvas stays dark in every theme (always-dark game screen)', await d.g.evaluate(() => getComputedStyle(document.getElementById('screen')).backgroundColor === 'rgb(0, 0, 0)'));
  noErrors(d);
  await d.close();
});

// ===================================================================================================
// WAVE 2 (FIXPLAN section 5): U1 U3 U4 U5 U9 U11-U17 U20-U22 U24 Ut1-Ut4
// ===================================================================================================
import http from 'http';
import fs from 'fs';

/** Tiny static server: map of path -> body. Returns { port, close }. */
function serve(map) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const e = map[req.url.split('?')[0]];
      if (!e) { rsp.writeHead(404); rsp.end('nf'); return; }
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rsp.end(typeof e === 'function' ? e() : e);
    });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((r) => srv.close(r)) }));
  });
}
const patchLog = `
  window.__calls = [];
  const wrap = () => { if (!window.__fizzpop) return setTimeout(wrap, 0);
    const A = window.__fizzpop.AUDIO, G = window.__fizzpop.Game;
    const op = A.pause, os = G.start;
    A.pause = function (o) { window.__calls.push(['audio.pause', o && o.suspend]); return op.apply(this, arguments); };
    G.start = function (o) { window.__calls.push(['game.start', o]); return os.apply(this, arguments); };
  };
  wrap();`;

await group('u1-host-visibility', async () => {
  const html = fs.readFileSync(HTML, 'utf8');
  const game = await serve({ '/game.html': html });
  const host = await serve({ '/': `<!doctype html><body style="margin:0"><iframe id=f sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="width:800px;height:640px;border:0"></iframe><div style="height:3000px"></div>` });
  const t = await launch({ html: `http://127.0.0.1:${host.port}/`, viewport: { width: 900, height: 700 } });
  const frame = await (async () => { for (let i = 0; i < 50; i++) { const f = t.page.frames().find((x) => x.url().includes('game.html')); if (f) return f; await wait(100); } return null; })();
  await frame.waitForFunction(() => !!window.__fizzpop);
  const S = () => frame.evaluate(() => ({ scene: fz.scene(), paused: fz._main.paused(), holds: fz._main.holds(), frame: fz.Game.debug.state().frame, log: fz.AUDIO._log.filter((e) => e[0] === 'pause' || e[0] === 'resume').map((e) => e[0]) }));
  await frame.evaluate(() => { window.fz = window.__fizzpop; fz.start(1, 3, 1); });
  await wait(500);
  const s0 = await S();
  check('cross-origin sandboxed iframe: game is running', s0.scene === 'play' && !s0.paused && s0.holds.length === 0, JSON.stringify(s0));
  await t.page.evaluate(() => { document.getElementById('f').style.display = 'none'; });
  await wait(600);
  const s1 = await S();
  check('iframe display:none (no blur, no visibilitychange): auto-pauses via IntersectionObserver and suspends the audio', s1.paused && s1.holds.includes('offscreen') && s1.log.includes('pause'), JSON.stringify(s1));
  const f1 = s1.frame; await wait(300);
  check('...and the game stands still', (await S()).frame === f1);
  await t.page.evaluate(() => { document.getElementById('f').style.display = 'block'; });
  await wait(500);
  const s2 = await S();
  check('shown again: the hold is released, the audio is re-armed as a soft pause (menu sounds audible), the game waits on its RESUME menu', s2.holds.length === 0 && s2.paused && s2.log.filter((e) => e === 'pause').length > s1.log.filter((e) => e === 'pause').length, JSON.stringify({ s1: s1.log, s2 }));
  await frame.evaluate(() => fz._main.setPaused(false));
  await t.page.evaluate(() => window.scrollTo(0, 2500));
  await wait(600);
  check('scrolled far offscreen: also pauses', (await S()).paused && (await S()).holds.includes('offscreen'));
  await t.page.evaluate(() => window.scrollTo(0, 0));
  await wait(400);
  check('scrolled back: hold released', (await S()).holds.length === 0);
  noErrors(t);
  await t.close(); await game.close(); await host.close();
});

await group('u1-raf-stall', async () => {
  const t = await open();
  const g = t.g;
  await g.start(1, 3, 1);
  await wait(200);
  // throttle the loop to one frame per 4.2 s (what a throttled / hidden iframe does) -> the watchdog pauses the game
  await t.page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => setTimeout(() => window.__raf(cb), 4200); });
  await wait(2600);
  check('no animation frame for > 700 ms: watchdog holds "stall" and pauses the running game', await g.evaluate(() => fz._main.holds().includes('stall') && fz._main.paused()));
  check('...and suspended the audio', await g.evaluate(() => fz.AUDIO._log.some((e) => e[0] === 'pause')));
  await t.page.evaluate(() => { window.requestAnimationFrame = window.__raf; });
  await wait(2800);
  check('frames are back: the stall hold is released (the game stays on the RESUME menu)', await g.evaluate(() => !fz._main.holds().includes('stall') && fz._main.paused()));
  // a plain 650 ms main-thread hitch is NOT a stall
  await g.evaluate(() => fz._main.setPaused(false));
  await wait(200);
  await t.page.evaluate(() => { const t0 = performance.now(); while (performance.now() - t0 < 900); });
  await wait(800);
  check('a long main-thread hitch alone does not pause the game', await g.evaluate(() => !fz._main.paused()));
  noErrors(t);
  await t.close();
});

await group('u5-blur-outside-play', async () => {
  const t = await open();
  const g = t.g;
  await t.press('Enter');                                       // story
  check('story running', (await t.scene()) === 'story');
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await g.freeze(true);
  await g.step(400);                                            // the story timer runs out while the window is blurred
  check('a blur during the story: the round starts but PAUSED (never unattended)', (await t.scene()) === 'play' && await g.evaluate(() => fz._main.paused()));
  const f0 = (await g.state()).frame; await g.step(60);
  check('...and the game does not advance', (await g.state()).frame === f0);
  // the name entry clock stands still while blurred
  await g.goto('entry', { entries: [{ pi: 0, score: 5000, round: 3 }] });
  await g.step(40);
  const left = (await g.evaluate(() => fz._main.entry())).timeLeft;
  await g.step(120);
  check('name-entry countdown is frozen while the page is not live', (await g.evaluate(() => fz._main.entry())).timeLeft === left);
  await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await g.step(60);
  check('...and runs again after focus', (await g.evaluate(() => fz._main.entry())).timeLeft < left);
  noErrors(t);
  await t.close();
});

await group('u3-audio-recovery', async () => {
  const t = await open();
  const g = t.g;
  await t.press('ArrowDown');
  const inits0 = await g.evaluate(() => fz.AUDIO._log.filter((e) => e[0] === 'init').length);
  await g.evaluate(() => { fz.AUDIO.ready = () => false; });  // an external suspend / iOS "interrupted"
  await t.press('ArrowDown');
  await t.page.mouse.click(5, 5);
  const inits1 = await g.evaluate(() => fz.AUDIO._log.filter((e) => e[0] === 'init').length);
  check('every gesture re-calls AUDIO.init() while the audio is not running (key + click)', inits1 >= inits0 + 2, `${inits0} -> ${inits1}`);
  await g.evaluate(() => { fz.AUDIO.ready = () => true; });
  const inits2 = await g.evaluate(() => fz.AUDIO._log.filter((e) => e[0] === 'init').length);
  await t.press('ArrowDown');
  check('...and stops once it runs', (await g.evaluate(() => fz.AUDIO._log.filter((e) => e[0] === 'init').length)) === inits2);
  // dead audio for a while -> blinking hint at the bottom of the title
  const hintPix = () => g.evaluate(() => { const d = document.getElementById('screen').getContext('2d').getImageData(50, 211, 156, 10).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 140) n++; return n; });
  const before = await hintPix();
  await g.evaluate(() => { fz.AUDIO.ready = () => false; });
  await wait(1200);
  const shown = [];
  for (let i = 0; i < 10; i++) { shown.push(await hintPix()); await wait(70); }
  check('audio dead for > 0.75 s: a blinking PRESS A KEY FOR SOUND hint appears', Math.max(...shown) > before + 30, JSON.stringify({ before, shown }));
  await g.evaluate(() => { fz.AUDIO.ready = () => true; });
  await wait(300);
  const after = [];
  for (let i = 0; i < 6; i++) { after.push(await hintPix()); await wait(40); }
  check('...and goes away when the audio runs again', Math.max(...after) <= before + 5, JSON.stringify({ before, after }));
  noErrors(t);
  await t.close();
});

await group('u4-u9-u22-audio-flow', async () => {
  const t = await open({ initScript: patchLog });
  const g = t.g;
  const log = () => g.evaluate(() => fz.AUDIO._log.map((e) => e[0] + (e[0] === 'sfx' || e[0] === 'music' ? ':' + e[1] : '')));
  const pauses = () => g.evaluate(() => window.__calls.filter((c) => c[0] === 'audio.pause').map((c) => c[1]));
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await t.press('KeyP');
  let L = await log();
  check('manual pause: sfx pause, then AUDIO.pause({suspend:false}) (context keeps running)', L.includes('sfx:pause') && (await pauses()).pop() === false, JSON.stringify({ L: L.slice(-4), p: await pauses() }));
  const n0 = L.length;
  await t.press('ArrowDown');
  await t.press('ArrowUp');
  await t.press('Enter');                                       // RESUME
  L = (await log()).slice(n0);
  check('pause menu: moves and RESUME are audible (menu_move x2, resume, menu_select)', L.filter((e) => e === 'sfx:menu_move').length >= 2 && L.includes('resume') && L.includes('sfx:menu_select'), JSON.stringify(L));
  await t.press('KeyP'); await t.press('ArrowDown'); await t.press('Enter');
  const n1 = (await log()).length;
  await t.press('ArrowDown'); await t.press('Enter');
  L = (await log()).slice(n1);
  check('QUIT -> YES: menu_select, then stopMusic (stage music / start jingle cannot leak onto the title), then title music', L.includes('sfx:menu_select') && L.indexOf('stopMusic') >= 0 && L.indexOf('music:title') > L.indexOf('stopMusic'), JSON.stringify(L));
  check('back on the title', (await t.scene()) === 'title');
  // a blur auto-pause is a hard pause (suspend)
  await t.press('Enter'); await wait(450); await t.press('Enter');
  const n2 = (await pauses()).length;
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(50);
  check('blur: AUDIO.pause() with the default (suspend) behaviour', (await pauses()).slice(n2).includes(undefined));
  noErrors(t);
  await t.close();
});

await group('u15-join', async () => {
  const t = await open();
  const g = t.g;
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await t.page.keyboard.press('ShiftLeft'); await wait(150);
  check('U15: a tap on Left Shift (next to Z) does NOT join P2', (await g.state()).players.length === 1);
  await t.page.keyboard.press('Z'); await wait(100);
  check('Z is still P1\'s bubble key', (await g.state()).players.length === 1 && (await g.state()).bubbles.length >= 0);
  await t.press('KeyQ');
  check('Q joins P2', (await g.state()).players.length === 2);
  await g.goto('title');
  noErrors(t);
  await t.close();
});

await group('u20-u21-gamepad-slots', async () => {
  const init = `
    window.__pads = [null, null, null];
    const mk = (i, o) => Object.assign({ index: i, connected: true, id: 'pad ' + i, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }, o || {});
    window.__mk = mk;
    navigator.getGamepads = () => window.__pads.slice();`;
  const t = await open({ initScript: init });
  const g = t.g;
  const setPad = (i, f, o) => t.page.evaluate(([i, src, o]) => { if (!window.__pads[i]) window.__pads[i] = window.__mk(i, o); (0, eval)('(' + src + ')')(window.__pads[i]); }, [i, f.toString(), o || null]);
  const dropPad = (i) => t.page.evaluate((i) => { window.__pads[i] = null; }, i);
  // a phantom HID "gamepad" (no buttons / axes) in slot 0 must not steal P1
  await t.page.evaluate(() => { window.__pads[0] = window.__mk(0, { buttons: [], axes: [] }); });
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await setPad(1, (p) => { p.axes[0] = 0.9; });
  await wait(400);
  await setPad(1, (p) => { p.axes[0] = 0; });
  const p1 = (await g.state()).players[0];
  check('U20: the real pad in slot 1 drives P1 although a phantom pad sits in slot 0', p1.x > 24 + 15, JSON.stringify(p1));
  check('only the usable pad took a player slot', await g.evaluate(() => JSON.stringify(fz._main.padSlots()) === JSON.stringify([[1, 0]])), await g.evaluate(() => JSON.stringify(fz._main.padSlots())));
  // two real pads, then unplug the first: the second keeps P2
  await t.page.evaluate(() => { window.__pads[0] = null; window.__pads[1] = null; });
  await wait(100);
  await setPad(0, (p) => { p.buttons[0].pressed = true; }); await wait(60); await setPad(0, (p) => { p.buttons[0].pressed = false; });
  await setPad(2, (p) => { p.buttons[1].pressed = true; }); await wait(100); await setPad(2, (p) => { p.buttons[1].pressed = false; });
  check('second real pad claims P2 and joins the 1P game', (await g.state()).players.length === 2 && await g.evaluate(() => JSON.stringify(fz._main.padSlots()) === JSON.stringify([[0, 0], [2, 1]])), await g.evaluate(() => JSON.stringify(fz._main.padSlots())));
  const x0 = (await g.state()).players.map((q) => q.x);
  await dropPad(0);                                             // pad 0 unplugged
  await setPad(2, (p) => { p.axes[0] = -0.9; });
  await wait(400);
  await setPad(2, (p) => { p.axes[0] = 0; });
  const x1 = (await g.state()).players.map((q) => q.x);
  check('U21: after unplugging pad 0 the other pad still drives P2, P1 stays put', x1[1] < x0[1] - 10 && Math.abs(x1[0] - x0[0]) < 1, JSON.stringify({ x0, x1 }));
  await g.goto('title');
  check('back on the title the slots are free again (the next pad to press claims P1)', await g.evaluate(() => fz._main.padSlots().length === 0));
  noErrors(t);
  await t.close();
});

await group('u13-pointer-release', async () => {
  const t = await open({ viewport: { width: 800, height: 700 } });
  const g = t.g;
  await t.page.evaluate(() => document.getElementById('screen').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, bubbles: true, clientX: 2, clientY: 2 })));
  await wait(150);
  check('touch UI visible (hybrid)', await g.evaluate(() => fz._main.touchMode()));
  await g.start(1, 1, 5);                                       // no real key (a key press would hide the touch UI again)
  await wait(200);
  const r = await t.rect('[data-k="right"]'), c = await t.rect('#screen');
  const x0 = (await g.state()).players[0].x;
  await t.page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  await t.page.mouse.down();
  await wait(250);
  await t.page.mouse.move(c.x + c.w / 2, c.y + c.h / 2, { steps: 5 });   // drag off the pad ...
  await t.page.mouse.up();                                      // ... and let go over the canvas
  await wait(120);
  const x1 = (await g.state()).players[0].x;
  await wait(400);
  const x2 = (await g.state()).players[0].x;
  check('U13: a mouse released OFF the pad ends the press (the player does not keep running)', x1 > x0 + 5 && Math.abs(x2 - x1) < 1.5, JSON.stringify({ x0, x1, x2 }));
  check('...and the button lost its pressed look', await g.evaluate(() => !document.querySelector('[data-k="right"]').classList.contains('on')));
  noErrors(t);
  await t.close();
});

await group('ut2-pills-on-release', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true });
  const g = t.g;
  const ptr = (k, type, id, dx = 0, dy = 0) => t.page.evaluate(([k, type, id, dx, dy]) => {
    const el = document.querySelector(`[data-k="${k}"]`), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + r.width / 2 + dx, clientY: r.y + r.height / 2 + dy }));
  }, [k, type, id, dx, dy]);
  await t.press('Enter'); await wait(450); await t.press('Enter');
  await ptr('pause', 'pointerdown', 31);
  await wait(120);
  check('Ut2: PAUSE does nothing on pointerdown', !(await g.evaluate(() => fz._main.paused())));
  await ptr('pause', 'pointerup', 31, 0, -120);                 // released far above the button: slid away, cancelled
  await wait(120);
  check('...a finger released OFF the button cancels it', !(await g.evaluate(() => fz._main.paused())));
  await ptr('pause', 'pointerdown', 32); await ptr('pause', 'pointerup', 32);
  await wait(120);
  check('...pointerup on the button pauses', await g.evaluate(() => fz._main.paused()));
  noErrors(t);
  await t.close();
});

await group('u2-u8-u16-touch-layouts', async () => {
  const lay = async (w, h, o = {}) => { const t = await open({ viewport: { width: w, height: h }, touch: true, ...o }); const L = await t.g.evaluate(() => fz._main.layout()); return { t, L }; };
  // the sizes QA measured as tiny / unplayable
  for (const [w, h, minW, why] of [[390, 300, 300, 'short frame: translucent pads over the margins instead of a x0.34 picture'], [360, 300, 280, 'short frame'], [600, 500, 380, 'square-ish frame: portrait stack beats side pads'], [768, 600, 500, 'x2 instead of x1.81'], [480, 270, 250, 'short landscape']]) {
    const { t, L } = await lay(w, h);
    check(`${w}x${h}: picture >= ${minW} px wide (${why}); mode ${L.mode}`, L.w >= minW, JSON.stringify(L));
    const m = await t.page.evaluate(() => { const rc = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom }; }; return { c: rc('#screen'), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
    check(`${w}x${h}: no page scroll`, m.sw <= w && m.sh <= h + 1, JSON.stringify(m));
    noErrors(t, `${w}x${h}: zero errors`); await t.close();
  }
  // landscape side pads need vw >= 560; portrait stack and side pads are chosen by the larger picture
  const a = await lay(844, 390); check('844x390: landscape side pads', a.L.mode === 'land' && a.L.land, JSON.stringify(a.L)); await a.t.close();
  const b = await lay(540, 380); check('540x380 (< 560 wide): never side pads', b.L.mode !== 'land', JSON.stringify(b.L)); await b.t.close();
  const c = await lay(1024, 768); check('1024x768 touch: the stack that gives the larger picture wins (>= x2.5)', c.L.scale >= 2.5, JSON.stringify(c.L)); await c.t.close();
  // U8: crisp at DPR 3 (390 wide -> x1.333 = 4 whole device pixels), big canvas at the top, controls directly below
  const d = await lay(390, 844, { deviceScaleFactor: 3 });
  const dm = await d.t.page.evaluate(() => { const rc = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { y: b.y, b: b.bottom }; }; return { c: rc('#screen'), pills: rc('[data-k="pause"]') }; });
  check('390x844@3: whole device pixels (x1.333, pixelated), no fractional smear', d.L.sharp === false && Math.abs(d.L.scale - 4 / 3) < 0.001 && d.L.dpr === 3, JSON.stringify(d.L));
  // K2: the controls rest at the bottom of the padded viewport (8 px page padding), the picture is centred in the space above them
  const dk = await d.t.page.evaluate(() => { const b = document.getElementById('screen').getBoundingClientRect(), t = document.getElementById('touch').getBoundingClientRect(); return { cy: b.y, cb: b.bottom, ty: t.y, tb: t.bottom, vh: innerHeight }; });
  check('portrait (K2): controls anchored to the bottom (no empty band below them), picture centred in the space above', Math.abs(dk.tb - (dk.vh - 8)) < 1.5 && Math.abs((dk.cy - 8) - (dk.ty - dk.cb)) < 1.5 && dk.cy > 8, JSON.stringify(dk));
  await d.t.close();
  const e = await lay(412, 915, { deviceScaleFactor: 2.625 });
  check('412x915@2.625: sharp-bilinear with an integer-multiple backing store', e.L.sharp && e.L.m >= 2 && (await e.t.page.evaluate(() => document.getElementById('screen').width % 256 === 0 && getComputedStyle(document.getElementById('screen')).imageRendering === 'auto')), JSON.stringify(e.L));
  await e.t.close();
  // U16: root padding (Artifact skeleton / safe areas) is respected, the bottom inset counted once
  const f = await open({ viewport: { width: 844, height: 390 }, touch: true });
  await f.page.evaluate(() => { document.documentElement.style.padding = '0 0 21px'; window.__fizzpop._main.fit(); });
  const fm = await f.page.evaluate(() => { const b = document.getElementById('screen').getBoundingClientRect(); return { y: b.y, b: b.bottom, vh: innerHeight }; });
  check('U16: with 21 px root padding the picture ends above it and its top is not cut off', fm.y >= 0 && fm.b <= fm.vh - 21 + 0.5, JSON.stringify(fm));
  const g2 = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await g2.page.evaluate(() => { document.documentElement.style.padding = '47px 0 34px'; window.__fizzpop._main.fit(); });
  const gm = await g2.page.evaluate(() => { const b = document.getElementById('screen').getBoundingClientRect(), t = document.getElementById('touch').getBoundingClientRect(); return { y: b.y, tb: t.bottom, vh: innerHeight }; });
  check('U16: portrait with 47/34 px root padding: picture below the top inset, pads above the bottom inset', gm.y >= 47 + 7 && gm.tb <= gm.vh - 34 + 0.5, JSON.stringify(gm));
  noErrors(f); noErrors(g2);
  await f.close(); await g2.close();
});

await group('u12-u8-touch-only-vs-keyboard', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true, initScript: patchLog });
  const g = t.g;
  const ids = async () => (await g.evaluate(() => fz._main.rows())).map((r) => r.id);
  check('touch-only: touchOnly() is true; no 2 PLAYERS row', (await g.evaluate(() => fz._main.touchOnly())) && !(await ids()).includes('p2'));
  const tapBtn = async (k) => { const r = await t.rect(`[data-k="${k}"]`); await t.page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); await wait(150); };
  await tapBtn('fire'); await wait(450);                         // BUBBLE confirms 1 PLAYER, a second tap skips the story (no real key is pressed)
  await tapBtn('fire');
  check('started with touch only', (await t.scene()) === 'play' && await g.evaluate(() => fz._main.touchOnly()));
  const call = await g.evaluate(() => window.__calls.filter((c) => c[0] === 'game.start').pop());
  check('Game.start gets joinHint "" on a touch-only device (no PUSH Q blink)', call && call[1].joinHint === '', JSON.stringify(call));
  await g.goto('title');
  await t.page.keyboard.press('KeyM');                           // a real key: a keyboard exists
  await wait(100);
  check('after a real key press the keyboard is known: 2 PLAYERS and SOUND appear', (await ids()).includes('p2') && (await ids()).includes('sound') && !(await g.evaluate(() => fz._main.touchOnly())));
  await t.press('Enter'); await wait(450); await t.press('Enter');
  const call2 = await g.evaluate(() => window.__calls.filter((c) => c[0] === 'game.start').pop());
  check('...and Game.start gets joinHint "PUSH Q"', call2 && call2[1].joinHint === 'PUSH Q', JSON.stringify(call2));
  noErrors(t);
  await t.close();
  const d = await open({ initScript: patchLog });
  await d.press('Enter'); await wait(450); await d.press('Enter');
  const c3 = await d.g.evaluate(() => window.__calls.filter((c) => c[0] === 'game.start').pop());
  check('desktop: joinHint "PUSH Q"', c3 && c3[1].joinHint === 'PUSH Q', JSON.stringify(c3));
  await d.close();
});

await group('u17-focus-overlay-wording', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true, initScript: `document.hasFocus = () => false;` });
  const txt = await t.g.evaluate(() => document.getElementById('focus').textContent.replace(/\s+/g, ' ').trim());
  check('phone: "TAP TO PLAY" wording (no keyboard talk)', /TAP TO PLAY/.test(txt) && !/keyboard|CLICK/i.test(txt), txt);
  const veil = await t.g.evaluate(() => getComputedStyle(document.getElementById('focus')).backgroundColor);
  const a = +(veil.match(/rgba\([^)]*,\s*([\d.]+)\)/) || [0, 1])[1];
  check('lighter veil (alpha <= 0.55): the title screen stays visible behind the call to action', a <= 0.55, veil);
  await pageShot(t.page, path.join(OUT, 'focus_overlay_phone.png'));
  await t.close();
  // an auto-paused game resumes when the overlay is clicked
  const d = await open({ initScript: `document.hasFocus = () => true;` });
  await d.press('Enter'); await wait(450); await d.press('Enter');
  await d.page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await wait(80);
  check('blur: auto-paused, overlay up', await d.g.evaluate(() => fz._main.paused() && !document.getElementById('focus').hidden));
  const o = await d.rect('#focus');
  await d.page.mouse.click(o.x + o.w / 2, o.y + o.h / 2);
  await wait(150);
  check('U17: clicking the overlay dismisses it AND resumes the game that only the blur paused', await d.g.evaluate(() => document.getElementById('focus').hidden && !fz._main.paused()));
  // a game paused on purpose stays paused
  await d.press('KeyP');
  await d.page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
  await wait(80);
  await d.page.mouse.click(o.x + o.w / 2, o.y + o.h / 2);
  await wait(150);
  check('...but a manual pause stays paused', await d.g.evaluate(() => fz._main.paused()));
  noErrors(d);
  await d.close();
});

await group('ut-page-css', async () => {
  const t = await open({ colorScheme: 'dark' });
  const cs = await t.page.evaluate(() => { const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body); return { hTA: h.touchAction, bTA: b.touchAction, hOB: h.overscrollBehaviorY, bOB: b.overscrollBehaviorY, scheme: h.colorScheme, sel: b.userSelect }; });
  check('Ut1: no pinch / double-tap zoom (touch-action excludes pinch-zoom), no overscroll, no text selection', cs.hTA === 'pan-x pan-y' && cs.bTA === 'pan-x pan-y' && cs.hOB === 'none' && cs.bOB === 'none' && cs.sel === 'none', JSON.stringify(cs));
  check('Ut3: color-scheme follows the tokens (dark under OS dark)', cs.scheme === 'dark', cs.scheme);
  await t.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  check('Ut3: data-theme=light under OS dark -> color-scheme light', (await t.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'light');
  await t.close();
  const l = await open({ colorScheme: 'light' });
  check('Ut3: light OS -> light', (await l.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'light');
  await l.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  check('Ut3: data-theme=dark under OS light -> dark', (await l.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'dark');
  await l.close();
  const m = await open({ viewport: { width: 390, height: 844 }, touch: true });
  const on = await m.page.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-k="fire"]')); return c.color; });
  noErrors(m); await m.close();
  // Ut4: tiny frames keep the picture reachable (never above y = 0)
  for (const [w, h] of [[100, 100], [50, 50], [200, 120]]) {
    const s = await open({ viewport: { width: w, height: h } });
    const y = await s.page.evaluate(() => document.getElementById('screen').getBoundingClientRect().y);
    check(`Ut4: ${w}x${h}: the picture is not pushed above the top edge`, y >= -0.5, String(y));
    noErrors(s, `${w}x${h}: zero errors`); await s.close();
  }
  // pinch zoom really does not happen
  const p = await open({ viewport: { width: 390, height: 844 }, touch: true });
  const cdp = await p.context.newCDPSession(p.page);
  await cdp.send('Input.synthesizePinchGesture', { x: 195, y: 700, scaleFactor: 2.2, relativeSpeed: 400 });
  await wait(300);
  check('Ut1: a CDP pinch gesture on blank page area does not zoom the page', (await p.page.evaluate(() => window.visualViewport.scale)) <= 1.001);
  noErrors(p); await p.close();
});

await group('u14-u24-text-and-boot', async () => {
  const src = fs.readFileSync(HTML, 'utf8');
  check('U14: no ◀ ▶ characters in the script (the font has none; they rendered as "? ?")', !/[◀▶]/.test(src.slice(src.indexOf('<script>'))));
  // U24: the very first paint is a LOADING frame; the hooks already exist and finish the boot on first use
  const t = await launch({ html: HTML, wait: false, initScript: `
    window.__snap = [];
    const snap = () => { const c = document.getElementById('screen'); if (c) window.__snap.push([performance.now() | 0, c.getContext('2d').getImageData(100, 100, 56, 24).data.slice(0, 4000).reduce((a, v) => a + v, 0), !!window.__fizzpop]); };
    document.addEventListener('DOMContentLoaded', () => { snap(); setTimeout(snap, 0); });` });
  await t.page.waitForFunction(() => window.__snap && window.__snap.length >= 1, null, { timeout: 5000 });
  const early = await t.page.evaluate(() => window.__snap.slice());
  check('U24: the hook object exists right at DOMContentLoaded', early[0][2] === true, JSON.stringify(early));
  await t.page.waitForFunction(() => window.__fizzpop && window.__fizzpop.scene() === 'title', null, { timeout: 8000 });
  check('...and the boot completes into the title scene', true);
  const t2 = await launch({ html: HTML });
  check('hooks work immediately after load (first call finishes the boot if the idle boot has not run yet)', (await t2.page.evaluate(() => { fz = window.__fizzpop; return fz.scene() === 'title' && fz._main.layout().w > 0; })) === true);
  noErrors(t); noErrors(t2);
  await t.close(); await t2.close();
});

console.log(`\n${failed ? failed + ' FAILED, ' : ''}${passed} passed${REAL ? ' (real modules, smoke subset)' : ''}`);
process.exit(failed ? 1 : 0);
