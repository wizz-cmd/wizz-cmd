// QA v2 (ux lens): page chrome in light / dark, odd Artifact pane sizes, overlay + title + play at each. Full-page screenshots + layout facts + overflow checks.
import path from 'path';
import fs from 'fs';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const CFG = [
  { name: 'c_desk_dark', w: 1280, h: 800, dpr: 1, touch: false, scheme: 'dark' },
  { name: 'c_desk_light', w: 1280, h: 800, dpr: 1, touch: false, scheme: 'light' },
  { name: 'c_ph390_dark', w: 390, h: 844, dpr: 3, touch: true, scheme: 'dark' },
  { name: 'c_ph360_light', w: 360, h: 740, dpr: 3, touch: true, scheme: 'light' },
  { name: 'c_land_dark', w: 844, h: 390, dpr: 3, touch: true, scheme: 'dark' },
  { name: 'c_pane700', w: 700, h: 800, dpr: 2, touch: false, scheme: 'dark' },
  { name: 'c_pane1024x600', w: 1024, h: 600, dpr: 1, touch: false, scheme: 'dark' },
  { name: 'c_pane1280x500', w: 1280, h: 500, dpr: 1, touch: false, scheme: 'light' },
  { name: 'c_pane600x400', w: 600, h: 400, dpr: 1, touch: false, scheme: 'dark' },
  { name: 'c_tablet768', w: 768, h: 1024, dpr: 2, touch: true, scheme: 'dark' },
  { name: 'c_ph320x568', w: 320, h: 568, dpr: 2, touch: true, scheme: 'dark' },
  { name: 'x_land667x375', w: 667, h: 375, dpr: 2, touch: true, scheme: 'dark' },
  { name: 'x_land568x320', w: 568, h: 320, dpr: 2, touch: true, scheme: 'dark' },
  { name: 'x_land932x430', w: 932, h: 430, dpr: 3, touch: true, scheme: 'light' },
  { name: 'x_ph375x667', w: 375, h: 667, dpr: 2, touch: true, scheme: 'light' },
  { name: 'x_land520x300', w: 520, h: 300, dpr: 2, touch: true, scheme: 'dark' },
];
const only = process.argv[2];
const rep = {};
for (const c of CFG) {
  if (only && !c.name.includes(only)) continue;
  const t = await open({ ...c });
  await wait(1200);
  const shotp = (l) => t.page.screenshot({ path: path.join(OUT, `${c.name}_${l}.png`) });
  await shotp('0_overlay');
  const facts0 = await t.ev(() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; const cv = document.getElementById('screen'); return { lay: fz._main.layout(), cv: r(cv), legend: r(document.getElementById('legend')), legendDisp: getComputedStyle(document.getElementById('legend')).display, touchBox: r(document.getElementById('touch')), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight], bg: getComputedStyle(document.body).backgroundColor, cs: getComputedStyle(document.documentElement).colorScheme, btn: [...document.querySelectorAll('#touch button')].map((b) => ({ k: b.dataset.k, r: r(b) })) }; });
  // click overlay
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.9]; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  if (c.touch) { const k = await touchKit(t); await k.tap(fr.x + ov[0], fr.y + ov[1]); } else await t.page.mouse.click(fr.x + ov[0], fr.y + ov[1]);
  await wait(1800);
  await shotp('1_title');
  await t.ev(() => fz.start(1, 1, 5));
  await wait(3500);
  await shotp('2_play');
  const facts1 = await t.ev(() => ({ lay: fz._main.layout(), q: fz.quality, perf: fz._main.perf() }));
  rep[c.name] = { facts0, facts1 };
  console.log(c.name, JSON.stringify({ lay: { scale: facts0.lay.scale, k: facts0.lay.k, mode: facts0.lay.mode, legend: facts0.lay.legend, w: Math.round(facts0.lay.w), h: Math.round(facts0.lay.h) }, cv: facts0.cv, scroll: facts0.scroll, bg: facts0.bg, cs: facts0.cs, legendDisp: facts0.legendDisp, btn: facts0.btn.map((b) => b.k + ':' + b.r.join('x')) }), 'errors', t.errors.length);
  await t.close();
}
fs.writeFileSync(path.join(OUT, 'chrome_report.json'), JSON.stringify(rep, null, 1));
