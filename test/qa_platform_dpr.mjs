// QA platform: common laptop viewport/DPR combos (Windows 125/150 % scaling). Is the canvas an exact integer number of device pixels per game pixel?
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser();
const combos = [[1366, 768, 1], [1536, 864, 1.25], [1280, 720, 1.5], [1440, 900, 2], [1280, 800, 1.25], [1707, 960, 1.125], [1600, 900, 1.25], [1920, 969, 1], [1280, 665, 1], [800, 600, 1.5], [1024, 768, 1.25]];
for (const [w, h, dpr] of combos) {
  const t = await open({ browser: b, viewport: { width: w, height: h }, dpr });
  const r = await ev(t.page, () => { const c = document.getElementById('screen'); const r = c.getBoundingClientRect(); const dpr = devicePixelRatio; const devW = r.width * dpr, devH = r.height * dpr; return { css: [r.width, r.height], dev: [devW, devH], perPx: [devW / 256, devH / 224], usage: +(100 * r.width * r.height / (innerWidth * innerHeight)).toFixed(0) }; });
  const ok = Math.abs(r.perPx[0] - Math.round(r.perPx[0])) < 0.002 && Math.abs(r.perPx[1] - Math.round(r.perPx[1])) < 0.002;
  log(`${w}x${h}@${dpr}: canvas css ${r.css.join('x')}  device ${r.dev.map((v) => +v.toFixed(2)).join('x')}  device px per game px ${r.perPx.map((v) => +v.toFixed(3)).join(' / ')}  integer=${ok} usage=${r.usage}%`);
  await t.close();
}
await b.close();
