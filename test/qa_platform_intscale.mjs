// QA platform: how much does the integer-scale policy waste at realistic browser viewports / Artifact frame sizes?
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser();
log('viewport            canvas scale  best-fit k  area wasted vs fit');
for (const [w, h, dpr] of [[1366, 657, 1], [1366, 768, 1], [1536, 730, 1.25], [1440, 780, 2], [1280, 600, 1], [1024, 640, 1], [900, 700, 1], [720, 640, 1], [640, 560, 1], [600, 900, 1], [500, 700, 1], [1920, 940, 1], [2560, 1300, 1], [1280, 720, 1]]) {
  const t = await open({ browser: b, viewport: { width: w, height: h }, dpr });
  const r = await ev(t.page, () => { const l = fz._main.layout(); return { s: l.scale, k: Math.min(l.availW / 256, l.availH / 224) }; });
  log(`${(w + 'x' + h + '@' + dpr).padEnd(18)}  ${r.s.toFixed(2).padStart(6)}      ${r.k.toFixed(2).padStart(6)}      ${(100 * (1 - (r.s / r.k) ** 2)).toFixed(0)}% of the available area unused`);
  await t.close();
}
await b.close();
