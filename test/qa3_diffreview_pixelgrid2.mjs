// Careful device-pixel run-length measure: stop RAF, paint alternating black/white 1-px columns, page-screenshot, find the canvas by its pure black/white pixels.
import { launch, log, check } from './qa3_diffreview_lib.mjs';
const rows = [];
for (const [dpr, w, h, touch] of [[3, 390, 844, true], [3, 375, 667, true], [3, 412, 915, true], [1.25, 1366, 768, false], [1.5, 1366, 768, false], [2.75, 412, 915, true], [2, 390, 844, true]]) {
  const t = await launch({ viewport: { width: w, height: h }, touch, deviceScaleFactor: dpr });
  const page = t.page;
  await page.waitForFunction(() => !!window.__fizzpop); await page.evaluate(() => window.__fizzpop.scene()); await page.waitForTimeout(300);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(100);
  const info = await page.evaluate(() => { const L = window.__fizzpop._main.layout(); const c = document.getElementById('screen'); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; const k = c.width / 256; for (let i = 0; i < 256; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(i * k, 0, k, c.height); } document.documentElement.style.background = '#808080'; document.body.style.background = '#808080'; const r = c.getBoundingClientRect(); return { sharp: L.sharp, m: L.m, css: [r.left, r.top, r.width, r.height] }; });
  await page.waitForTimeout(150);
  const buf = await page.screenshot({ fullPage: false });
  const res = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    // pick a row in the vertical middle of the picture area: scan all rows to find one with many pure black/white pixels
    let bestY = 0, bestN = 0;
    for (let y = 0; y < img.height; y += 7) { const d = g.getImageData(0, y, img.width, 1).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; if ((v < 8 || v > 247) && d[i + 1] === v && d[i + 2] === v) n++; } if (n > bestN) { bestN = n; bestY = y; } }
    const d = g.getImageData(0, bestY, img.width, 1).data;
    const isBW = (i) => { const v = d[i * 4]; return (v < 8 || v > 247) && d[i * 4 + 1] === v && d[i * 4 + 2] === v; };
    let x0 = 0; while (x0 < img.width && !isBW(x0)) x0++; let x1 = img.width - 1; while (x1 > x0 && !isBW(x1)) x1--;
    const runs = []; let cur = d[x0 * 4] > 127, n = 0;
    for (let i = x0; i <= x1; i++) { const v = d[i * 4] > 127; if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } } runs.push(n);
    const hist = {}; runs.forEach((r) => { hist[r] = (hist[r] || 0) + 1; });
    return { imgW: img.width, x0, x1, width: x1 - x0 + 1, runs: runs.length, hist };
  }, buf.toString('base64'));
  log(`dpr${dpr} ${w}x${h}${touch ? 't' : ''} sharp=${info.sharp} m=${info.m} cssW=${info.css[2].toFixed(3)} -> device width ${res.width}px (ideal ${(info.css[2] * dpr).toFixed(2)}), ${res.runs} runs ${JSON.stringify(res.hist)}`);
  rows.push({ dpr, w, h, info, res });
  await t.close();
}
