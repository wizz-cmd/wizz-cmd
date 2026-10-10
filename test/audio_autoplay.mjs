// FIZZ & POP — test/audio_autoplay.mjs
// Browser autoplay policy simulation. Headless Chromium lets file:// pages play without a gesture, so an init script
// wraps AudioContext: `state` reports 'suspended' and resume() does nothing until window.__unblock() is called
// (exactly what a blocked context looks like to the engine). Checks:
//   - init()/music()/jingle()/sfx() before a gesture never throw and never stall the game:
//     a jingle's onEnd is still delivered (wall-clock watchdog) and sfx are silently dropped,
//   - a requested loop starts as soon as a real click resumes the context.
import { createRequire } from 'module';
import path from 'path';
import { PROJECT } from '../tools/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });   // default autoplay policy
const page = await (await browser.newContext({ viewport: { width: 600, height: 400 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const Real = window.AudioContext;
  let blocked = true;
  window.__unblock = () => { blocked = false; };
  window.AudioContext = class extends Real {
    get state() { return blocked ? 'suspended' : super.state; }
    resume() { return blocked ? Promise.resolve() : super.resume(); }
  };
});
await page.goto('file://' + path.join(PROJECT, 'test', 'audio_page.html'));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };

const a = await page.evaluate(async () => {
  window.ends = [];
  AUDIO.init();                                           // no user gesture yet -> context suspended
  AUDIO.music('stage1');
  AUDIO.sfx('pop');
  const t0 = performance.now();
  AUDIO.jingle('start', { onEnd: () => ends.push(performance.now() - t0) });
  await new Promise((r) => setTimeout(r, 500));
  return { st: AUDIO._stats(), ready: AUDIO.ready() };
});
check('suspended context: ready() false, no groups', a.ready === false && a.st.groups === 0, a.st);
const b = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 4600)); return { ends: ends.slice(), st: AUDIO._stats() }; });
check('jingle onEnd delivered by the watchdog even though the context never ran', b.ends.length === 1 && b.ends[0] > 2250 && b.ends[0] < 4500, b.ends);
await page.evaluate(() => { AUDIO.music('stage1'); });
await page.evaluate(() => { __unblock(); AUDIO.init(); });   // the user finally clicked
await page.waitForTimeout(800);
const c = await page.evaluate(() => ({ st: AUDIO._stats(), ready: AUDIO.ready() }));
check('after a real gesture the context runs and the loop plays', c.ready && c.st.current === 'stage1' && c.st.curCount > 0, c.st);
check('no console errors', errors.length === 0, errors);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
