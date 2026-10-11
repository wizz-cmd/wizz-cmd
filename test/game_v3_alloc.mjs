// FIZZ & POP v3 - G7 allocation audit of the Game module: how much garbage do update() and render() make per frame, and WHO makes it.
//   node test/game_v3_alloc.mjs [k=3] [frames=1500]          real GFX / cast (REAL modules), busy 2P scene (8 enemies, 38 bubbles, chains), Game.update + Game.render per frame
//   GAME=../backup/v3/game_40_game.js node test/game_v3_alloc.mjs    the same with another Game build (before / after)
//   ASSERT=1 node test/game_v3_alloc.mjs       exit 1 when the Game module itself allocates more than the budget below
// Method: (1) the V8 sampling heap profiler (includes objects collected by minor GCs) attributes allocated bytes to the function that allocated them, summed per script;
//         (2) total bytes per frame from the used-heap growth with a huge young generation (no scavenge during the run).
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = +(process.argv[2] || 3), FRAMES = +(process.argv[3] || 1500);
const GAME = process.env.GAME ? '&game=' + process.env.GAME : '';
const BUDGET_GAME_KB_PER_FRAME = +(process.env.BUDGET || 28);       // the Game module's own garbage per frame (update + render, busy 2P scene; pre-v3: 60). What is left are boxed numbers crossing into GFX
const BUDGET_UPDATE_KB_PER_FRAME = +(process.env.BUDGET_UPDATE || 8);   // update() alone (pre-v3: 38)

async function run(profile) {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc' + (profile ? '' : ' --min-semi-space-size=128 --max-semi-space-size=128')] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(PROJECT, 'test', 'game_harness.html') + `?real=1&k=${K}&post=0` + GAME);
  await page.waitForFunction(() => !!window.__t);
  await page.evaluate(() => __t.freeze(true));
  await page.evaluate(async () => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    T.start({ players: 2, level: 8, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); const S = T.S();
    for (let i = 0; i < 8; i++) Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 30 + i * 24, 60 + (i % 3) * 40);
    for (let i = 0; i < 38; i++) Game.debug.spawn(['thunder', 'fire', 'water'][i % 3], 24 + (i % 10) * 20, 40 + Math.floor(i / 10) * 30);
    for (const b of S.bubbles) { b.att = null; b.life = 1e9; }
    S.players[0].inv = 0; S.players[1].inv = 0; Game.debug.noClear(true);
    window.__drive = (n) => {
      const I = [{ right: (n >> 5) % 2 === 0, left: (n >> 5) % 2 === 1, fire: n % 6 < 3, jump: n % 40 === 0 }, { left: (n >> 5) % 2 === 0, right: (n >> 5) % 2 === 1, fire: n % 8 < 3 }];
      if (n % 25 === 0) { for (let k = 0; k < 5; k++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } Game.debug.give(0, 'bomb'); }
      if (n % 90 === 0) for (const b of S.bubbles) { if (b.dead) continue; b.life = 1e9; }
      T.tick(1, I); T.render();
    };
    for (let n = 0; n < 500; n++) window.__drive(n);                // warm-up: JIT tiers, particle / sprite caches
    await new Promise((r) => setTimeout(r, 300));
  });
  let result;
  if (profile) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await page.evaluate((N) => { for (let n = 0; n < N; n++) window.__drive(500 + n); }, FRAMES);
    const { profile: prof } = await cdp.send('HeapProfiler.stopSampling');
    const byFn = new Map(), byUrl = new Map(); let total = 0;
    const walk = (n) => { if (n.selfSize) { const cf = n.callFrame; const url = (cf.url || '(native)').split('/').pop(); const key = (cf.functionName || '(anonymous)') + ' ' + url + ':' + cf.lineNumber; byFn.set(key, (byFn.get(key) || 0) + n.selfSize); byUrl.set(url, (byUrl.get(url) || 0) + n.selfSize); total += n.selfSize; } for (const c of n.children || []) walk(c); };
    walk(prof.head);
    result = { total, byFn: [...byFn.entries()].sort((a, b) => b[1] - a[1]), byUrl: [...byUrl.entries()].sort((a, b) => b[1] - a[1]) };
  } else {
    const NT = Math.min(FRAMES, 400);                                  // short runs: the young generation (128 MB) must not fill up, or a scavenge would hide allocation
    const r = await page.evaluate((N) => {
      gc(); const m0 = performance.memory.usedJSHeapSize; const t0 = performance.now();
      for (let n = 0; n < N; n++) window.__drive(500 + n);
      const m1 = performance.memory.usedJSHeapSize; const ms = performance.now() - t0;
      // update only
      gc(); const u0 = performance.memory.usedJSHeapSize; for (let n = 0; n < N; n++) { __t.tick(1, [{ right: (n >> 5) % 2 === 0, fire: n % 6 < 3 }, { left: (n >> 5) % 2 === 0 }]); } const u1 = performance.memory.usedJSHeapSize;
      // render only
      gc(); const r0 = performance.memory.usedJSHeapSize; for (let n = 0; n < N; n++) __t.render(); const r1 = performance.memory.usedJSHeapSize;
      return { both: (m1 - m0) / N, ms: ms / N, update: (u1 - u0) / N, render: (r1 - r0) / N };
    }, NT);
    result = r;
  }
  if (errors.length) console.log('errors', errors);
  await browser.close();
  return result;
}

const prof = await run(true);
const tot = await run(false);
const kb = (b) => (b / 1024 / FRAMES).toFixed(2).padStart(8) + ' KB/frame';
console.log(`k=${K} busy 2P scene, ${FRAMES} frames, Game: ${process.env.GAME || 'src/40_game.js'}`);
console.log('total allocation per frame (heap growth, no scavenges): both ' + (tot.both / 1024).toFixed(1) + ' KB, update only ' + (tot.update / 1024).toFixed(1) + ' KB, render only ' + (tot.render / 1024).toFixed(1) + ' KB  (' + tot.ms.toFixed(2) + ' ms per frame incl. render at k=' + K + ')');
console.log('sampled allocation by script:'); for (const [u, b] of prof.byUrl.slice(0, 8)) console.log('  ' + kb(b) + '  ' + u);
console.log('top allocating functions:'); for (const [f, b] of prof.byFn.slice(0, 16)) console.log('  ' + kb(b) + '  ' + f);
const gameKB = (prof.byUrl.find(([u]) => /40_game|game_/.test(u)) || [0, 0])[1] / 1024 / FRAMES;
console.log('Game module (40_game.js) own allocation: ' + gameKB.toFixed(2) + ' KB/frame (budget ' + BUDGET_GAME_KB_PER_FRAME + ')');
console.log('update() alone: ' + (tot.update / 1024).toFixed(1) + ' KB/frame (budget ' + BUDGET_UPDATE_KB_PER_FRAME + ')');
if (process.env.ASSERT && (gameKB > BUDGET_GAME_KB_PER_FRAME || tot.update / 1024 > BUDGET_UPDATE_KB_PER_FRAME)) { console.log('FAIL: over budget'); process.exit(1); }
