// Audio/pause race: AUDIO.tick() has a wall-clock fallback ("context not running -> never let a jingle stall the game"): when ctx.state !== 'running'
// and !paused it finishes every jingle whose wallDeadline (set from performance.now() at creation, not extended while paused) has passed.
// After a long pause AUDIO.resume() flips `paused` to false immediately but ctx.resume() resolves asynchronously, so for a few ticks the context is
// still 'suspended' -> the half-played 'start' jingle is cut and its onEnd (stage music) fires immediately.  (20_audio.js tick ~1379, resume ~1522)
import { launch, fp, log } from './qa_codereview_lib.mjs';
// ctx.resume() latency: real devices (mobile Safari / Android Chrome after a long suspend) take 50-300 ms; emulate 120 ms (env RESUME_MS, default 120)
const RESUME_MS = +(process.env.RESUME_MS ?? 120);
const t = await launch({ initScript: `(() => { const o = AudioContext.prototype.resume; AudioContext.prototype.resume = function () { const ctx = this; return new Promise((res) => setTimeout(() => res(o.call(ctx)), ${RESUME_MS})); }; })();` });
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');
await t.page.waitForTimeout(300);
const st = () => g.evaluate(() => { const s = fz.AUDIO._state(); return { jingle: s.jingle, music: s.music, ctx: s.ctxState, paused: s.paused }; });
await g.evaluate(() => fz.start(1, 1, 5));
await t.page.waitForTimeout(700);
log('0.7 s after game start     ', JSON.stringify(await st()), ' (start jingle is ~3 s long)');
await g.evaluate(() => fz.goto('pause'));
await t.page.waitForTimeout(5500);                                    // pause for longer than the jingle's wall-clock deadline
log('paused for 5.5 s           ', JSON.stringify(await st()));
await g.evaluate(() => fz._main.setPaused(false));
const rows = [];
for (let i = 0; i < 12; i++) { rows.push(JSON.stringify(await st())); await t.page.waitForTimeout(40); }
log('after RESUME, every ~40 ms:\n  ' + rows.join('\n  '));
const cut = rows.some((r) => JSON.parse(r).music && JSON.parse(r).music.startsWith('stage'));
log('BUG_REPRODUCED (jingle cut short by resume, stage music starts immediately) =', cut);
log('errors', t.errors);
await t.close();
