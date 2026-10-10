// QA3 art: every non-play scene on the real dist build at x3 (title, story, howto, scores, entry, ending, pause) -> out/qa3/art/scenes
import path from 'path';
import fs from 'fs';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa3/art/scenes'); fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name, scale = 3) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale });
await g.freeze(true);
await g.goto('title'); for (const f of [10, 120, 400]) { const cur = await g.evaluate(() => fz._main.sceneTime()); await g.step(Math.max(1, f - cur)); await shot('title_' + f); }
for (const f of [30, 120, 230, 400]) { await g.goto('story', { attract: true }); await g.step(f); await shot(`story_${f}`); }
for (let p = 0; p < 6; p++) { await g.goto('howto', { page: p }); await g.step(40); await shot('howto_' + p); }
await g.goto('scores', {}); await g.step(30); await shot('scores');
await g.goto('entry', { entries: [{ pi: 0, score: 41230, round: 9 }] }); await g.step(40); await shot('entry');
await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
for (const f of [60, 240, 420, 600, 900, 1200, 1600, 2000, 2400, 2900]) { const cur = await g.evaluate(() => fz._main.sceneTime()); await g.step(Math.max(1, f - cur)); await shot('ending_' + String(f).padStart(4, '0')); }
console.log('errors:', JSON.stringify(t.errors));
await t.close();
