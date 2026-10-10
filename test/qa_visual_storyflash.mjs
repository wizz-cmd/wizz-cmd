import { launch, fp } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await g.goto('story', { attract: true });
const rows = [];
let cur = 0;
for (let f = 0; f <= 260; f += 10) {
  await g.step(f - cur); cur = f;
  const v = await g.evaluate(() => { const c = document.getElementById('screen').getContext('2d', { willReadFrequently: true }); const d = c.getImageData(40, 100, 176, 6).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return Math.round(s / n); });
  rows.push(f + ':' + v);
}
console.log(rows.join(' '));
await t.close();
