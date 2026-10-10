// Pixel-grid evenness: draw alternating 1px columns/rows on the canvas, stop RAF, screenshot at several DPRs/viewports and
// measure run lengths in DEVICE pixels. Crisp = every run the same length (integer). Reports min/max run + share of odd runs.
import { launchBrowser, open, save, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser();
const rows = [];
const cfgs = [];
for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) for (const [w, h] of [[1280, 800], [1536, 864], [1920, 1080], [800, 600], [390, 844], [844, 390]]) cfgs.push([dpr, w, h]);
for (const [dpr, w, h] of cfgs) {
  const touch = w < 900;
  const t = await open({ browser, viewport: { width: w, height: h }, dpr, touch });
  await sleep(150);
  await t.page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await sleep(120);
  await t.page.evaluate(() => { const c = document.getElementById('screen'); const x = c.getContext('2d'); for (let i = 0; i < 256; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(i, 0, 1, 224); } });
  await sleep(100);
  const box = await t.page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const buf = await t.page.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y + box.h / 2 - 1), width: Math.min(box.w, w - Math.max(0, box.x)), height: 2 } });
  const res = await t.page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, 1).data; const runs = []; let cur = d[0] > 127, n = 0;
    for (let i = 0; i < img.width; i++) { const v = d[i * 4] > 127; if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } } runs.push(n);
    const inner = runs.slice(1, -1); const hist = {}; inner.forEach((r) => { hist[r] = (hist[r] || 0) + 1; });
    return { imgW: img.width, hist };
  }, buf.toString('base64'));
  const keys = Object.keys(res.hist).map(Number).sort((a, b) => a - b);
  const even = keys.length <= 1;
  rows.push({ dpr, vp: `${w}x${h}`, canvasCss: `${box.w}x${box.h}`, runLengthsDevPx: res.hist, even });
  console.log(`dpr${dpr}`.padEnd(8), `${w}x${h}`.padEnd(10), 'canvas', `${box.w}x${box.h}`.padEnd(10), even ? 'EVEN' : 'UNEVEN', JSON.stringify(res.hist));
  await t.close();
}
await browser.close();
save('pixelgrid.json', rows);
