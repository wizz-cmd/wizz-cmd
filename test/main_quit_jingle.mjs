// U4 proof with the REAL modules (dist/fizzpop.html): quitting during the 3 s start jingle must leave the title playing the
// 'title' loop -- no silence until the jingle ends, no stage1 music leaking onto the title. Same flow as
// qa_codereview_quit_jingle_real.mjs, with the new YES / NO question after QUIT.  node test/main_quit_jingle.mjs
import { launch, fp } from '../tools/harness.mjs';
let failed = 0;
const check = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   ' + x}`); };
const t = await launch({});
const g = fp(t.page);
const st = () => g.evaluate(() => { const s = fz.AUDIO._state(); return { scene: fz.scene(), music: s.music, jingle: s.jingle }; });
const wait = (ms) => t.page.waitForTimeout(ms);
const key = async (k, ms = 150) => { await t.page.keyboard.press(k); await wait(ms); };
await key('Enter', 300);                       // 1 PLAYER (also unlocks audio)
await wait(500);
await key('Enter', 500);                       // skip the story -> play; the start jingle begins
const play = await st();
check('in play with the start jingle sounding', play.scene === 'play' && play.jingle === 'start', JSON.stringify(play));
await key('Escape'); await key('ArrowDown'); await key('Enter', 200);           // QUIT -> asks first
check('QUIT asks YES / NO (still in play)', (await st()).scene === 'play');
await key('ArrowDown'); await key('Enter', 300);                                // YES
const q = await st();
check('back on the title, the start jingle is gone', q.scene === 'title' && q.jingle === null, JSON.stringify(q));
check('the title loop is playing (not silence)', q.music === 'title', JSON.stringify(q));
let leaked = null;
for (let i = 0; i < 8; i++) { await wait(700); const s = await st(); if (s.scene !== 'title' || s.music !== 'title' || s.jingle) leaked = s; }
check('stays on the title music for 5.6 s (no stage1 after the old jingle would have ended)', !leaked, JSON.stringify(leaked));
check('zero console errors', t.errors.length === 0, JSON.stringify(t.errors));
await t.close();
process.exit(failed ? 1 : 0);
