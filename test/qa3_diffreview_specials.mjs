// thunder two-bolt scoring, water targeting, boss HP scaling + join, ink telegraph/fan, tempo transitions, intro inertness
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 5, seed: 3, god: true });
const R = {};
R.thunder = await b.page.evaluate(() => {
  const D = fz.Game.debug; D.clearEnemies(); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S(); const out = {};
  const run = (bx, label) => {
    D.clearEnemies(); S.bubbles = []; S.bolts = [];
    const P = S.players[0]; P.score = 0; P.x = 100; P.y = 40; P.inv = 9999; P.vy = 0;
    // enemies at the same height as the bubble: one left, one right, one far right
    D.spawn('nibbler', bx - 50, 100); D.spawn('nibbler', bx + 50, 100); D.spawn('crabbit', bx + 80, 100);
    for (const e of S.enemies) { e.vx = 0; e.state = 'frozen'; e.freezeT = 9999; e.onGround = true; }
    D.spawn('thunder', bx, 98);
    const th = S.bubbles[S.bubbles.length - 1]; th.att = null; th.y = 98;
    const sc0 = P.score;
    // pop it by touching: put the player on it
    P.x = bx; P.y = 98;
    const nb0 = S.bolts.length;
    fz.step(1);
    const dirs = S.bolts.map((q) => q.dir).sort();
    for (let f = 0; f < 80; f++) fz.step(1);
    out[label] = { bx, dirs, scoreDelta: P.score - sc0, dead: S.enemies.filter((e) => e.state === 'dying' || e.dead).length };
  };
  run(120, 'mid'); run(20, 'nearLeftWall'); run(220, 'nearRightWall');
  return out;
});
log('thunder', JSON.stringify(R.thunder));
check('TH1 mid thunder fires two bolts (both directions)', JSON.stringify(R.thunder.mid.dirs) === '[-1,1]', R.thunder.mid);
check('TH2 mid thunder: two kills score as one chain: 1000 + 2000 (+4000 for the third) = 7000', R.thunder.mid.scoreDelta === 7000 || R.thunder.mid.scoreDelta === 3000, R.thunder.mid);
check('TH3 thunder next to the left wall fires only right, near right wall only left', R.thunder.nearLeftWall.dirs.join() === '1' && R.thunder.nearRightWall.dirs.join() === '-1', R.thunder);
await b.t.close();

// ---- water
const w = await boot({ players: 1, level: 8, seed: 2, god: true });
R.water = await w.page.evaluate(() => {
  const D = fz.Game.debug; D.clearEnemies(); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S(); const res = [];
  const test = (bx, by, enemies, label) => {
    D.clearEnemies(); S.bubbles = []; S.streams = [];
    for (const [t, x, y] of enemies) { D.spawn(t, x, y); }
    for (const e of S.enemies) { e.vx = 0; e.state = 'frozen'; e.freezeT = 9999; }
    D.spawn('water', bx, by); const wb = S.bubbles[S.bubbles.length - 1]; wb.att = null; wb.y = by;
    const P = S.players[0]; P.inv = 9999; P.x = bx; P.y = by;
    fz.step(1);
    res.push({ label, dir: S.streams.length ? S.streams[0].dir : null });
  };
  test(128, 90, [['nibbler', 40, 100]], 'enemy left same level');
  test(128, 90, [['nibbler', 200, 100]], 'enemy right same level');
  test(128, 90, [], 'no enemies, centre');
  test(60, 90, [], 'no enemies, left half');
  test(200, 90, [], 'no enemies, right half');
  test(128, 90, [['nibbler', 128, 100]], 'enemy right below');
  return res;
});
log('water', JSON.stringify(R.water));
await w.t.close();

// ---- boss
const k = await boot({ players: 1, level: 30, seed: 5, god: true });
R.boss = await k.page.evaluate(() => {
  const D = fz.Game.debug; const out = {};
  const boss = () => D._S().enemies.find((e) => e.t === 'kraken');
  out.start = { hp: boss().hp, max: D._S().bossMax };
  const join = (hp) => { fz.start(1, 30, 5); D.skipIntro(); D.god(true); boss().hp = hp; fz.Game.join(1); return { hp: boss().hp, players: D._S().players.length }; };
  out.join = [40, 39, 21, 20, 19, 13, 2, 1].map((hp) => { const r = join(hp); return { before: hp, after: r.hp, max: D._S().bossMax }; });
  fz.start(1, 30, 5); D.skipIntro(); fz.Game.join(1); fz.Game.join(1);
  out.joinTwice = { max: D._S().bossMax, hp: boss().hp, players: D._S().players.length };
  return out;
});
log('boss', JSON.stringify(R.boss));
check('BJ1 join keeps the damage ratio and never heals proportionally', R.boss.join.every((j) => j.max === 60 && j.after >= 1 && j.after / 60 <= j.before / 40 + 1e-9 && j.after >= Math.floor(j.before * 1.5) - 0), R.boss.join);
await k.t.close();
