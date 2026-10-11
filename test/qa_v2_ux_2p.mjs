// QA v2 (ux lens): the 2-player walk on desktop (keyboard), sandboxed iframe: title -> 2 PLAYERS -> story -> round 1 (HUD, join hint) -> pause -> game over -> two entries -> scores
// Also: 1P game + 'PUSH Q' join, keyboard-only unlock (Tab/Enter on the overlay) in a second browser.
import path from 'path';
import { open, OUT, wait } from './qa_v2_ux_lib.mjs';
const name = process.argv[2] || 'p2';
const w = +(process.argv[3] || 1280), h = +(process.argv[4] || 800), dpr = +(process.argv[5] || 1);
{
  const t = await open({ w, h, dpr, name });
  let n = 0;
  const shot = async (label) => {
    n++; const id = String(n).padStart(2, '0') + '_' + label;
    const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const fr = await (await t.frame.frameElement()).boundingBox();
    await t.page.screenshot({ path: path.join(OUT, `${name}_${id}_cv.png`), clip: { x: fr.x + r.x, y: fr.y + r.y, width: r.w, height: r.h } });
  };
  const st = () => t.frame.evaluate(() => ({ scene: fz.scene(), rows: fz._main.rows(), paused: fz._main.paused(), s: (() => { try { const s = fz.Game.debug.state(); return { phase: s.phase, lives: s.players && s.players.map((p) => p.lives), level: s.level }; } catch (e) { return null; } })() }));
  await wait(1200);
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.85]; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  await t.page.mouse.click(fr.x + ov[0], fr.y + ov[1]);
  await wait(1500);
  // 2 players
  let s = await st();
  const idx = s.rows.findIndex((r) => r.id === 'p2');
  for (let i = 0; i < idx; i++) await t.key('ArrowDown');
  await shot('title_p2sel');
  await t.key('Enter');
  await wait(1200); await shot('story');
  await t.key('Enter'); // skip story
  await wait(2500); await shot('r1_ready');
  await wait(2000); await shot('r1_play');
  // P2 hold + fire
  await t.page.keyboard.down('KeyD'); await wait(700); await t.page.keyboard.up('KeyD');
  await t.page.keyboard.down('ArrowRight'); await wait(700); await t.page.keyboard.up('ArrowRight');
  await t.ev(() => { fz.Game.debug.spawn('crabbit', 60, 120); fz.Game.debug.spawn('nibbler', 180, 60); });
  await wait(1500); await shot('r1_play2');
  await t.key('KeyP'); await wait(600); await shot('pause');
  await t.key('KeyP'); await wait(500);
  await t.ev(() => { fz.Game.debug.addScore(0, 12300); fz.Game.debug.addScore(1, 8700); fz.Game.debug.setPlayer(0, { lives: 0, state: 'out' }); fz.Game.debug.setPlayer(1, { lives: 0, state: 'out' }); });
  await wait(1000); await shot('gameover');
  for (let i = 0; i < 20 && (await st()).scene === 'play'; i++) await wait(500);
  await wait(800); console.log('scene after gameover', (await st()).scene); await shot('entry_p1');
  await t.key('KeyS'); await t.key('KeyA'); await t.key('KeyM');
  await wait(1800); console.log('scene', (await st()).scene); await shot('entry_p2');
  await t.key('KeyP'); await t.key('KeyO'); await t.key('KeyP');
  await wait(1800); console.log('scene', (await st()).scene); await shot('scores_after');
  console.log('errors', JSON.stringify(t.errors));
  await t.close();
}
// ---- 1P game, join hint, then Q joins ------------------------------------------------------------------------
{
  const t = await open({ w, h, dpr, name: name + '_join' });
  let n = 0;
  const shot = async (label) => {
    n++; const id = String(n).padStart(2, '0') + '_' + label;
    const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const fr = await (await t.frame.frameElement()).boundingBox();
    await t.page.screenshot({ path: path.join(OUT, `${name}_join_${id}_cv.png`), clip: { x: fr.x + r.x, y: fr.y + r.y, width: r.w, height: r.h } });
  };
  await wait(1200);
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.85]; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  await t.page.mouse.click(fr.x + ov[0], fr.y + ov[1]);
  await wait(1200);
  await t.ev(() => fz.start(1, 3, 9));
  await wait(3500); await shot('p1_game');
  await t.key('KeyQ'); await wait(1500); await shot('joined');
  console.log('join state', JSON.stringify(await t.ev(() => { const s = fz.Game.debug.state(); return { n: s.players.length, lives: s.players.map((p) => p.lives) }; })));
  await t.close();
}
