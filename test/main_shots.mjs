// Scene gallery for Main: screenshots every scene (x3 canvas) into out/main/<variant>/.
// Usage: node test/main_shots.mjs [--real]     (default: stub modules; --real: actual src/10..40, read-only)
import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
import { buildMainPage } from './main_build.mjs';

const real = process.argv.includes('--real');
const page = buildMainPage(real);
const OUT = process.env.SHOTS_OUT || path.join(PROJECT, "out", "main", real ? "real" : "stubs");
const t = await launch({ html: page, viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale: 3 });
await g.freeze(true);

await g.goto('title'); await g.step(30); await shot('title');
await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1);
await shot('title_sel2');

for (const [n, f] of [[0, 30], [0, 70], [0, 120], [0, 170], [0, 230]]) {
  await g.goto('story', { attract: true }); await g.step(f); await shot(`story_${String(f).padStart(3, '0')}`);
}
for (let p = 0; p < 6; p++) { await g.goto('howto', { page: p }); await g.step(30); await shot('howto_' + p); }

await g.goto('scores', {}); await g.step(20); await shot('scores');
await g.evaluate(() => fz._main.resetScores());
await g.goto('entry', { entries: [{ pi: 0, score: 41230, round: 9 }, { pi: 1, score: 5300, round: 9 }] });
await g.step(40); await shot('entry_p1');
await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
await shot('entry_p1_letter');

await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
for (const f of [40, 300, 600, 900, 1300, 1700]) { const cur = await g.evaluate(() => fz._main.sceneTime()); await g.step(f - cur); await shot('ending_' + String(f).padStart(4, '0')); }

await g.start(1, 5, 7); await g.step(120); await shot('play');
await g.evaluate(() => fz._main.setPaused(true)); await g.step(1); await shot('pause');

console.log('errors:', JSON.stringify(t.errors));
await t.close();
process.exit(t.errors.length ? 1 : 0);
