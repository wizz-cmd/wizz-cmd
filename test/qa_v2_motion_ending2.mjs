import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.goto('ending', { entries: [], res: { won: true, level: 30, scores: [123400, 0], players: 1 } });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 1800; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); if (i % 200 === 199) await page.evaluate(() => { /* keep memory bounded: keep only metrics */ window.__m = (window.__m || []).concat(QA.metrics()); QA.reset(); }); }
const m = await page.evaluate(() => window.__m.concat(QA.metrics()));
const spikes = m.map((x, i) => [i, x.diff, x.lum]).filter(([i, d]) => d > 3);
console.log('frames with mean-abs-diff > 3:', spikes.map(s => `${s[0]}:${s[1].toFixed(1)}`).join(' '));
console.log('lum around 520-560', m.slice(515, 560).map(x => x.lum).join(' '));
await t.close();
