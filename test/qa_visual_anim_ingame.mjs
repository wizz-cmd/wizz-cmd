// In-game consecutive-frame strips: Fizz walk, jump arc, shoot -> bubble forming/floating/popping; Pop; enemy walk loops.
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { grab, montage } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/anim');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page); await g.freeze(true);
await g.evaluate(() => { window.H = { S: () => fz.Game.debug._S(), spawn(type, x, y, props) { fz.Game.debug.spawn(type, x, y); const S = H.S(); const e = S.enemies[S.enemies.length - 1]; if (props) Object.assign(e, props); return e; } }; });
// follow player: crop 48x40 around it
const follow = async (pi = 0, w = 56, h = 44) => { const s = await g.state(); const p = s.players[pi]; return grab(t.page, Math.max(0, Math.min(256 - w, Math.round(p.x - w / 2 + 8))), Math.max(16, Math.min(224 - h, Math.round(p.y - h / 2 + 8))), w, h); };
// ---- walk + jump + shoot (Fizz)
await g.start(1, 1, 3); await g.step(2);
await g.evaluate(() => { fz.Game.debug.god(true); fz.Game.debug.clearEnemies(); fz.Game.debug.skipIntro(); });
const tiles = [];
await g.set(0, { right: true });
for (let i = 0; i < 12; i++) { await g.step(3); tiles.push({ dataUrl: await follow(), w: 56, h: 44, label: 'walk+' + (i * 3) }); }
await g.set(0, { right: false });
await montage(t.page, path.join(OUT, 'fizz_walk.png'), tiles, { scale: 4, cols: 6, bg: '#000' });
// jump
const jt = [];
await g.step(10);
await g.set(0, { jump: true }); await g.step(1); await g.set(0, { jump: false });
for (let i = 0; i < 12; i++) { await g.step(8); jt.push({ dataUrl: await follow(0, 56, 80), w: 56, h: 80, label: 'jump+' + (i * 8 + 1) }); }
await montage(t.page, path.join(OUT, 'fizz_jump.png'), jt, { scale: 3, cols: 6 });
// shoot bubble sequence: 1 shot, then capture bubble crop following the bubble
await g.step(60);
await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 40, y: 200, face: 1 }); });
await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false });
const bt = [];
for (let i = 0; i < 24; i++) { await g.step(i < 12 ? 2 : 6); const s = await g.state(); const b = s.bubbles[0]; const x = b ? Math.max(0, Math.min(200, Math.round(b.x - 20))) : 40; const y = b ? Math.max(16, Math.min(180, Math.round(b.y - 14))) : 190; bt.push({ dataUrl: await grab(t.page, 24, 170, 90, 54), w: 90, h: 54, label: 'shoot f' + (await g.state()).frame }); }
await montage(t.page, path.join(OUT, 'fizz_shoot_bubble.png'), bt, { scale: 3, cols: 6 });
// bubble pop frames: pop the empty bubble by touching
console.log('errors', t.errors);
await t.close();
