import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/scenes');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name, scale = 3) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale });
await g.freeze(true);
await g.goto('title'); 
for (const f of [10, 60, 140]) { await g.step(f); await shot('title_' + f); }
await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1); await shot('title_sel2');
for (const f of [30, 100, 170, 230]) { await g.goto('story', { attract: true }); await g.step(f); await shot('story_' + f); }
for (let p = 0; p < 5; p++) { await g.goto('howto', { page: p }); await g.step(40); await shot('howto_' + p); }
await g.goto('scores', {}); await g.step(30); await shot('scores');
await g.goto('entry', { entries: [{ pi: 0, score: 41230, round: 9 }, { pi: 1, score: 5300, round: 9 }] });
await g.step(40); await shot('entry_p1');
await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
await shot('entry_p1_letter');
await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
for (const f of [40, 300, 600, 900, 1300, 1700, 2100, 2600]) { const cur = await g.evaluate(() => fz._main.sceneTime()); await g.step(f - cur); await shot('ending_' + String(f).padStart(4, '0')); }
console.log('errors', t.errors);
await t.close();
