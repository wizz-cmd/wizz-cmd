// QA visual: page chrome + touch layouts at several viewports, dark/light, title + play + pause.
import path from 'path';
import fs from 'fs';
import { launch, pageShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/phone');
const cases = [
  { name: 'p360x640', vp: { width: 360, height: 640 }, touch: true },
  { name: 'p390x844', vp: { width: 390, height: 844 }, touch: true },
  { name: 'l640x360', vp: { width: 640, height: 360 }, touch: true },
  { name: 'l844x390', vp: { width: 844, height: 390 }, touch: true },
  { name: 'tablet768x1024', vp: { width: 768, height: 1024 }, touch: true },
  { name: 'desk1280x800_dark', vp: { width: 1280, height: 800 }, touch: false, cs: 'dark' },
  { name: 'desk1280x800_light', vp: { width: 1280, height: 800 }, touch: false, cs: 'light' },
  { name: 'desk1920x1080', vp: { width: 1920, height: 1080 }, touch: false, cs: 'dark' },
  { name: 'small320x480', vp: { width: 320, height: 480 }, touch: true },
];
for (const c of cases) {
  const t = await launch({ viewport: c.vp, touch: c.touch, colorScheme: c.cs });
  const g = fp(t.page);
  await g.freeze(true);
  await g.step(60);
  if (c.touch) { await t.page.touchscreen.tap(c.vp.width / 2, 20); await g.freeze(true); }
  await pageShot(t.page, path.join(OUT, c.name + '_title.png'));
  await g.start(1, 6, 3); await g.step(120);
  await pageShot(t.page, path.join(OUT, c.name + '_play.png'));
  const lay = await g.evaluate(() => ({ layout: fz._main.layout(), touch: fz._main.touchMode(), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  console.log(c.name, JSON.stringify(lay), t.errors.length ? t.errors : '');
  await t.close();
}
