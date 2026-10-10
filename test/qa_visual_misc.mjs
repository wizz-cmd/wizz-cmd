// Focus overlay (click to play), hurry banner, enemy enter/poof frames.
import path from 'path';
import { launch, canvasShot, pageShot, fp, PROJECT } from '../tools/harness.mjs';
import { grab, montage } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/game');
const t = await launch({ viewport: { width: 1000, height: 760 } });
const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { const el = document.getElementById('focus'); el.hidden = false; });
await pageShot(t.page, path.join(OUT, 'focus_overlay.png'));
await t.page.evaluate(() => { document.getElementById('focus').hidden = true; });
// hurry
await g.start(1, 6, 3); await g.step(2);
await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.clearEnemies(); D.skipIntro(); D.spawn('nibbler', 60, 60); D.spawn('springle', 160, 100); const S = D._S(); D.setHurryTimer(S.hurryT + 0); });
const hurryAt = await g.evaluate(() => fz.LEVELS[5].hurry * 60);
await g.evaluate((h) => fz.Game.debug.setHurryTimer(h - 2), hurryAt);
const tiles = [];
for (let i = 0; i < 6; i++) { await g.step(4); tiles.push({ dataUrl: await grab(t.page, 0, 0, 256, 224), w: 256, h: 224, label: 'hurry+' + (i * 4 + 2) }); }
await montage(t.page, path.join(OUT, 'hurry_banner_frames.png'), tiles, { scale: 2, cols: 3, gap: 4 });
// ghost arrives
await g.evaluate((h) => fz.Game.debug.setHurryTimer(h + 599), hurryAt); await g.step(8);
await canvasShot(t.page, path.join(OUT, 'hurry_ghost.png'), { scale: 3 });
// enter phase frames (round 11, mixed)
await g.start(1, 16, 3);
const et = [];
for (const f of [3, 12, 24, 40, 60, 80, 100]) { const cur = (await g.state()).phaseT; await g.step(f - cur); et.push({ dataUrl: await grab(t.page, 0, 0, 256, 224), w: 256, h: 224, label: 'intro f' + f }); }
await montage(t.page, path.join(OUT, 'enter_frames_r16.png'), et, { scale: 2, cols: 4, gap: 4 });
console.log(t.errors);
await t.close();
