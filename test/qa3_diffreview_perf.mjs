import { boot, log } from './qa3_diffreview_lib.mjs';
const run = async (html, label) => {
  process.env.FIZZ_HTML = html;
  const b = await boot({ players: 2, level: 30, seed: 5, god: true });
  const r = await b.page.evaluate(() => {
    const D = fz.Game.debug; const S = D._S();
    for (let i = 0; i < 8; i++) D.spawn('thunder', 40 + i * 24, 150);
    const e = S.enemies[0]; if (e) e.hp = 30;
    // stress: many popups + bolts + projectiles
    const t = []; for (let f = 0; f < 600; f++) { for (let i = 0; i < 3; i++) S.proj.push({ type: 'ink', x: 100 + i * 20, y: 80, vx: 0.2 * (i - 1), vy: 0.8, age: 0, dead: false }); const t0 = performance.now(); fz.step(1); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b);
    return { avg: +(t.reduce((s, x) => s + x, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2), max: +t[t.length - 1].toFixed(2) };
  });
  log(label, JSON.stringify(r));
  await b.t.close();
};
await run(process.cwd() + '/dist/fizzpop.html', 'new');
await run(process.cwd() + '/out/qa3/diffreview/old.html', 'old');
