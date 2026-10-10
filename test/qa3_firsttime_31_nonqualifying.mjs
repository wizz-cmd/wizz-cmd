// Step 31: a newcomer scores 1200 (not in the top 8) and dies: after GAME OVER do they ever see their own score again / any message? (stepped, deterministic)
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'nq' });
await wait(500);
await t.ev(() => { fz.freeze(true); fz.start(1, 1, 3); fz.Game.debug.skipIntro(); fz.Game.debug.addScore(0, 1200); fz.Game.debug.setPlayer(0, { lives: 1 }); });
// let an enemy kill: teleport an angry nibbler onto the player
await t.ev(() => { const S = fz.Game.debug._S(); const p = S.players[0]; fz.Game.debug.spawn('nibbler', p.x, p.y); });
let sc = '', n = 0;
while (n < 3000) { await t.ev(() => fz.step(5)); n += 5; sc = await t.scene(); if (sc !== 'play') break; }
console.log('scene after', n, 'frames:', sc);
await t.ev(() => fz.step(3));
await t.shot('0_after', { canvas: true });
console.log('scene', await t.scene());
// record every string drawn on the next frames of the scores scene
await t.ev(() => { window.__txt = []; const o = fz.GFX.text; fz.GFX.text = function (c, str, ...a) { window.__txt.push(String(str)); return o.call(this, c, str, ...a); }; fz.step(2); fz.GFX.text = o; });
const strs = await t.ev(() => window.__txt);
console.log('strings drawn:', JSON.stringify(strs.filter((x) => x.trim().length > 3)));
check('a non-qualifying final score is shown to the player after GAME OVER (a string containing 1200 is drawn on the scores screen)', strs.some((x) => /1200/.test(x)), strs.slice(0, 12));
await t.close();
