// Random-input fuzz with invariant checks across levels/seeds (1P and 2P).
import { boot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 1, god: false });
const res = await ev((H) => {
  const rep = { violations: [], runs: 0, phases: {}, maxBubbles: 0, maxProj: 0, maxFx: 0, maxItems: 0, finalLevels: [] };
  const rnd = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let run = 0; run < 24; run++) {
    const R = rnd(1000 + run);
    const players = run % 3 === 0 ? 2 : 1, lvl = 1 + (run * 7) % 29;
    fz.start(players, lvl, 100 + run);
    const S = H.S();
    if (run % 2) fz.Game.debug.god(true);
    const held = [{}, {}];
    let lastPhase = '', stuckPlay = 0;
    for (let i = 0; i < 4000; i++) {
      for (let pi = 0; pi < players; pi++) {
        if (R() < 0.05) held[pi] = { left: R() < 0.4, right: R() < 0.4, jump: R() < 0.5, fire: R() < 0.5 };
        fz.input.set(pi, held[pi]);
      }
      fz.step(1);
      if (fz.Game.isOver()) { rep.phases['over@' + run] = i; break; }
      const st = S;
      rep.phases[st.phase] = (rep.phases[st.phase] || 0) + 1;
      rep.maxBubbles = Math.max(rep.maxBubbles, st.bubbles.length); rep.maxProj = Math.max(rep.maxProj, st.proj.length);
      rep.maxFx = Math.max(rep.maxFx, st.fx.length); rep.maxItems = Math.max(rep.maxItems, st.items.length);
      for (const p of st.players) {
        if (![p.x, p.y, p.vx, p.vy].every(Number.isFinite)) rep.violations.push({ run, i, what: 'player NaN' });
        if (p.state === 'normal' && (p.x < 15.99 || p.x > 224.01)) rep.violations.push({ run, i, what: 'player x oob', x: p.x });
        if (p.state === 'normal' && (p.y < 23.9 && p.vy <= 0 && st.phase === 'play' && p.y > -1) ) rep.violations.push({ run, i, what: 'player above row1', y: p.y });
        if (p.state === 'normal' && p.y > 225) rep.violations.push({ run, i, what: 'player y>225', y: p.y, vy: p.vy });
      }
      for (const e of st.enemies) {
        if (![e.x, e.y].every(Number.isFinite)) rep.violations.push({ run, i, what: 'enemy NaN', t: e.t });
        if (e.state === 'active' && (e.x < 15.9 || e.x > 224.1 || e.y > 225)) rep.violations.push({ run, i, what: 'enemy oob', t: e.t, x: e.x, y: e.y });
      }
      for (const b of st.bubbles) if (![b.x, b.y].every(Number.isFinite)) rep.violations.push({ run, i, what: 'bubble NaN' });
      if (st.bubbles.length > 60) rep.violations.push({ run, i, what: 'bubbles>60', n: st.bubbles.length });
    }
    rep.finalLevels.push({ run, players, start: lvl, end: S.level, over: fz.Game.isOver(), lives: S.players.map(p => p.lives), score: S.players.map(p => p.score) });
    fz.input.clear();
  }
  rep.violations = rep.violations.slice(0, 20);
  return rep;
});
console.log(JSON.stringify(res, null, 1));
console.log('errors', t.errors);
await t.close();
