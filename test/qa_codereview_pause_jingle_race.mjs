// Repeats qa_codereview_pause_jingle.mjs N times (the race window is only the few ms between AUDIO.resume() and ctx.resume() settling) and counts
// how often the half-played start jingle is cut by RESUME.  Usage: node test/qa_codereview_pause_jingle_race.mjs [trials=10]
import { launch, fp, log } from './qa_codereview_lib.mjs';
const N = +(process.argv[2] || 10);
const t = await launch({});
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');
await t.page.waitForTimeout(300);
let cut = 0;
for (let i = 0; i < N; i++) {
  await g.evaluate((i) => fz.start(1, 1, i + 1), i);
  await t.page.waitForTimeout(300);
  await g.evaluate(() => fz.goto('pause'));
  await t.page.waitForTimeout(4600);
  // resume and poll the audio state inside the page every animation frame / 5 ms to catch the race window
  const r = await g.evaluate(() => new Promise((res) => {
    fz._main.setPaused(false);
    const t0 = performance.now(); let cutAt = null;
    const iv = setInterval(() => { const s = fz.AUDIO._state(); if (!s.jingle) { cutAt = performance.now() - t0; } if (performance.now() - t0 > 400) { clearInterval(iv); res({ cutAt, state: s }); } }, 4);
  }));
  if (r.cutAt !== null) cut++;
  log('trial', i + 1, JSON.stringify(r));
}
log('jingle cut by RESUME in', cut, 'of', N, 'trials');
log('errors', t.errors);
await t.close();
