// FIZZ & POP -- test/audio_k7_realgame.mjs  (FIXPLAN2 K7, real game, real time)
// Start a real game from the title with real keys: the `start` jingle must be over (and the stage loop already sounding, chained on
// the jingle's end line) before the round-1 intro ends, and the intro itself must still be running when the jingle ends.
// Usage: node test/audio_k7_realgame.mjs [--html <path>]     (exit code 1 on failure)
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';
const hi = process.argv.indexOf('--html');
const t = await launch(hi > 0 ? { html: path.resolve(process.argv[hi + 1]) } : {});
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);
await t.page.evaluate(() => {
  const fz = window.__fizzpop, A = fz.AUDIO;
  window.__tl = []; const T0 = performance.now();
  window.__iv = setInterval(() => {
    let ph = null, pt = null; try { const s = fz.Game.debug.state(); ph = s.phase; pt = s.phaseT; } catch (e) { /* not in a game */ }
    const st = A._state(), ss = A._stats(), l = window.__tl[window.__tl.length - 1];
    if (!l || l.scene !== fz.scene() || l.ph !== ph || l.music !== st.music || l.jingle !== st.jingle)
      window.__tl.push({ t: Math.round(performance.now() - T0), scene: fz.scene(), ph, pt, music: st.music, jingle: st.jingle, startAt: ss.curStartAt, jend: ss.lastJingleEnd, now: ss.time });
  }, 10);
});
await t.page.keyboard.press('Enter'); await wait(900);      // title: 1 PLAYER
await t.page.keyboard.press('Enter');                         // skip the story card -> round 1 intro (jingle starts)
await wait(5500);
const tl = await t.page.evaluate(() => window.__tl.slice());
console.log(tl.map((s) => `${String(s.t).padStart(6)}ms ${s.scene}/${s.ph} phaseT=${s.pt} music=${s.music} jingle=${s.jingle}`).join('\n'));
const iJ = tl.findIndex((s) => s.jingle === 'start');
const iIntro = tl.findIndex((s, i) => s.scene === 'play' && s.ph === 'intro' && i >= 0);
const iLoop = tl.findIndex((s, i) => i > iJ && s.music === 'stage1' && s.jingle === null);
const iPlay = tl.findIndex((s, i) => i > iIntro && s.ph === 'play');
check('the start jingle played and the stage loop followed', iJ >= 0 && iLoop > iJ, { iJ, iLoop });
if (iJ >= 0 && iLoop > iJ) {
  const jDur = tl[iLoop].t - tl[iJ].t, introDur = iPlay > 0 ? tl[iPlay].t - tl[iIntro].t : null;
  check('jingle is over in <= 2.4 s', jDur <= 2400 && jDur >= 1900, jDur);
  check('stage loop is already sounding before the intro ends (jingle ends before the intro)', iPlay > iLoop && tl[iPlay].t - tl[iLoop].t >= 80, { loopAt: tl[iLoop].t, playAt: iPlay > 0 ? tl[iPlay].t : null, introDur });
  const last = tl[iLoop];
  check("the stage loop's first step is on the jingle's end line (|d| < 2 ms)", last.startAt !== null && last.jend !== null && Math.abs(last.startAt - last.jend) < 0.002, { startAt: last.startAt, jend: last.jend });
}
check('zero console errors', t.errors.length === 0, t.errors);
await t.close();
process.exit(results.every(Boolean) ? 0 : 1);
