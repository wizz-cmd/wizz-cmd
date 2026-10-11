// Photosensitivity probe: area of large relative-luminance changes (WCAG 2.3.1 style) between consecutive frames, for local strobes.
import { setup, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await page.evaluate(() => {
  QA.flashStats = (frames) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = lin(i);
    const Ls = frames.map(f => { const d = f.c.getContext('2d').getImageData(0, 0, f.c.width, f.c.height).data; const L = new Float32Array(d.length / 4); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * lut[d[i * 4]] + 0.7152 * lut[d[i * 4 + 1]] + 0.0722 * lut[d[i * 4 + 2]]; return L; });
    const out = [];
    for (let i = 1; i < Ls.length; i++) {
      let up = 0, dn = 0; const a = Ls[i - 1], b = Ls[i], n = a.length;
      for (let p = 0; p < n; p++) { const dl = b[p] - a[p]; if (dl >= 0.1 && a[p] < 0.8) up++; else if (dl <= -0.1 && b[p] < 0.8) dn++; }
      out.push({ i, up: +(up / n * 100).toFixed(2), dn: +(dn / n * 100).toFixed(2) });
    }
    return out;
  };
});
async function run(label, lvl, setup, n) {
  await g.start(1, lvl, 4);
  await g.step(1);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await g.step(10);
  await setup();
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < n; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
  const st = await page.evaluate(() => QA.flashStats(QA.frames));
  const worst = st.reduce((a, b) => (Math.max(a.up, a.dn) > Math.max(b.up, b.dn) ? a : b));
  const cnt = st.filter(s => Math.max(s.up, s.dn) >= 2).length;
  console.log(label, 'max changed-area % (>=10% lum, dark<0.8):', JSON.stringify(worst), ' frames with >=2% area:', cnt, '/', st.length);
  console.log('  series (area% up/dn):', st.slice(0, 40).map(s => `${s.up}/${s.dn}`).join(' '));
}
await run('boss ink telegraph phase1', 30, async () => { await g.evaluate(() => { const k = fz.Game.debug._S().enemies.find(e => e.t === 'kraken'); k.inkT = 30; }); }, 40);
await run('boss ink telegraph phase2', 30, async () => { await g.evaluate(() => { const k = fz.Game.debug._S().enemies.find(e => e.t === 'kraken'); k.hp = 10; k.inkT = 30; }); }, 40);
await run('boss hit flash', 30, async () => { await g.evaluate(() => { const k = fz.Game.debug._S().enemies.find(e => e.t === 'kraken'); k.flashT = 12; }); }, 24);
await t.close();
