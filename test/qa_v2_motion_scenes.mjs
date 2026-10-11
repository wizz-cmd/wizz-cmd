// scene-to-scene pops: per-frame luminance / frame diff across title -> story -> play (1P), play -> gameover -> entry -> scores -> title
import { setup, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.goto('title'); await g.step(40);
await g.set(0, { fire: true }); await g.step(2); await g.set(0, { fire: false });
await page.evaluate(() => QA.reset());
const scenes = [];
for (let i = 0; i < 520; i++) {
  await g.step(1);
  const sc = await g.scene();
  scenes.push(sc);
  if (i % 1 === 0) await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i);
}
const met = await page.evaluate(() => QA.metrics());
let prevScene = scenes[0]; const marks = [];
met.forEach((m, i) => { if (scenes[i] !== prevScene) { marks.push(`${i}:${prevScene}->${scenes[i]}`); prevScene = scenes[i]; } });
console.log('scene changes', marks.join(' '));
const diffs = met.map(m => m.diff);
const sorted = [...diffs].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
const spikes = met.map((m, i) => [i, m.diff, m.lum]).filter(([i, d]) => d > Math.max(6, med * 6));
console.log('median diff', med.toFixed(2), 'spikes (frame, diff, lum):', spikes.map(s => `${s[0]}:${s[1].toFixed(1)}/${s[2].toFixed(0)}`).join(' '));
// story flash frames: pixel-area of >=10% relative luminance change and a contact sheet of the flash
await page.evaluate(() => {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (f) => { const d = f.c.getContext('2d').getImageData(0, 0, f.c.width, f.c.height).data; const a = new Float32Array(d.length / 4); for (let i = 0; i < a.length; i++) a[i] = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]); return a; };
  window.__fs = [];
  for (let i = 95; i < 112; i++) { const a = L(QA.frames[i - 1]), b = L(QA.frames[i]); let up = 0, dn = 0, mean = 0; for (let p = 0; p < a.length; p++) { const d = b[p] - a[p]; mean += b[p]; if (d >= 0.1 && a[p] < 0.8) up++; else if (d <= -0.1 && b[p] < 0.8) dn++; } window.__fs.push([i, +(up / a.length * 100).toFixed(1), +(dn / a.length * 100).toFixed(1), +(mean / a.length).toFixed(3)]); }
});
console.log('story flash [frame, up%, down%, mean rel lum]:', JSON.stringify(await page.evaluate(() => window.__fs)));
await page.evaluate(() => { QA.frames = QA.frames.slice(94, 110); });
import('./qa_v2_motion_lib.mjs').then(async (m) => { await m.sheet(page, OUT + '/transition/story_flash.png', { cols: 8, scale: 0.4, smooth: true }); });
await new Promise(r => setTimeout(r, 1500));
await t.close();
