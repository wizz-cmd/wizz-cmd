// Integration smoke: real src/40_game.js inside the scaffold Main (stub GFX/AUDIO/LEVELS), real keyboard events.
//   node test/game_main_smoke.mjs
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const t = await launch({ html: path.join(PROJECT, 'test', process.env.PAGE || 'game_main_page.html') });   // PAGE=game_main_page_oldmain.html: scaffold Main snapshot
const page = t.page;
const g = fp(page);
let fails = 0;
const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };

await page.keyboard.press('Enter');                    // title -> 1 PLAYER (-> story intro, skippable)
await g.wait(150);
for (let i = 0; i < 5 && (await g.scene()) !== 'play'; i++) { await page.keyboard.press('Enter'); await g.wait(200); }   // skip story / any intro screens
check((await g.scene()) === 'play', 'Enter on the title starts the game (scene play) ' + (await g.scene()));
await g.wait(2800);                                    // intro (150 frames) + a bit
let s = await g.state();
check(s.phase === 'play', 'phase play after the intro (' + s.phase + ')');
await page.keyboard.down('ArrowRight'); await g.wait(500); await page.keyboard.up('ArrowRight');
const s2 = await g.state();
check(s2.players[0].x > s.players[0].x + 20, 'ArrowRight moves P1 (' + s.players[0].x.toFixed(1) + ' -> ' + s2.players[0].x.toFixed(1) + ')');
await page.keyboard.press('Space'); await g.wait(120);
check((await g.state()).bubbles.length >= 1, 'Space shoots a bubble (quick tap registered)');
await page.keyboard.press('KeyQ'); await g.wait(120);
const s3 = await g.state();
check(s3.players.length === 2, 'P2 bubble key joins a 1P game (players=' + s3.players.length + ')');
await page.keyboard.down('KeyA'); await g.wait(400); await page.keyboard.up('KeyA');
const s4 = await g.state();
check(s4.players[1].x < s3.players[1].x - 10, 'P2 moves with A');
await g.evaluate(() => fz.Game.debug.god(true));
await g.evaluate(() => fz.Game.debug.setLevel(30));
await g.wait(2600);
s = await g.state();
check(s.level === 30 && s.enemies[0] && s.enemies[0].t === 'kraken', 'boss round reachable via setLevel(30)');
await canvasShot(page, path.join(PROJECT, 'out', 'game', 'main_boss.png'));
await g.evaluate(() => fz.Game.debug.end && fz.Game.debug.end(true));
console.log('errors:', t.errors.length ? t.errors : 'none');
if (t.errors.length) fails++;
await t.close();
process.exit(fails ? 1 : 0);
