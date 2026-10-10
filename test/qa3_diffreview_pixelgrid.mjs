// Pixel-grid evenness with the wave-2 scaling: alternating 1 px columns, RAF stopped, screenshot, measure run lengths in DEVICE pixels.
import { launch, log, check } from './qa3_diffreview_lib.mjs';
const cfgs = [];
for (const dpr of [1, 1.25, 1.5, 2, 2.625, 2.75, 3, 3.5]) for (const [w, h, touch] of [[375, 667, true], [390, 844, true], [360, 800, true], [412, 915, true], [844, 390, true], [1280, 720, false], [1366, 768, false], [1920, 1080, false], [1536, 864, false], [768, 1024, false]]) cfgs.push([dpr, w, h, touch]);
let uneven = [];
for (const [dpr, w, h, touch] of cfgs) {
  const t = await launch({ viewport: { width: w, height: h }, touch, deviceScaleFactor: dpr });
  const page = t.page;
  await page.waitForFunction(() => !!window.__fizzpop); await page.evaluate(() => window.__fizzpop.scene());
  await page.waitForTimeout(200);
  const info = await page.evaluate(() => { window.requestAnimationFrame = () => 0; return window.__fizzpop._main.layout(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { const c = document.getElementById('screen'); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; const k = c.width / 256; for (let i = 0; i < 256; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(i * k, 0, k, c.height); } });
  await page.waitForTimeout(100);
  const box = await page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const buf = await page.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y + box.h / 2 - 1), width: Math.min(box.w, w - Math.max(0, box.x)), height: 2 } });
  const res = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, 1).data; const runs = []; let cur = d[0] > 127, n = 0;
    for (let i = 0; i < img.width; i++) { const v = d[i * 4] > 127; if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } } runs.push(n);
    const inner = runs.slice(1, -1); const hist = {}; inner.forEach((r) => { hist[r] = (hist[r] || 0) + 1; });
    return { imgW: img.width, hist };
  }, buf.toString('base64'));
  const keys = Object.keys(res.hist).map(Number).sort((a, b) => a - b);
  const even = keys.length <= 1 || (info.sharp);
  const line = `dpr${dpr}`.padEnd(8) + `${w}x${h}${touch ? 't' : ''}`.padEnd(10) + ` mode=${info.mode} sharp=${info.sharp} m=${info.m} css=${box.w.toFixed(2)}x${box.h.toFixed(2)} ${JSON.stringify(res.hist)} ${keys.length <= 1 ? 'EVEN' : 'UNEVEN'}`;
  log(line);
  if (!info.sharp && keys.length > 1) uneven.push(line);
  await t.close();
}
check('PG1 integer (non-sharp) layouts render every game pixel with the same number of device pixels', uneven.length === 0, uneven);
