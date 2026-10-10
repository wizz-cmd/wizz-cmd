// BUG: quitting to the title during the 3 s game-start jingle leaves Game's jingle onEnd callback alive
// (40_game.js startMusic, line ~366: guards are only `S && tok === musicSerial && !S.over`; Game has no stop()).
// When the jingle ends, AUDIO.music('stage1') replaces the title loop -> stage music plays on the title screen.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');              // unlock + init audio (unhandled key -> only unlockAudio())
await t.page.waitForTimeout(400);
const st = () => g.evaluate(() => { const s = fz.AUDIO._state(); return { scene: fz.scene(), music: s.music, jingle: s.jingle, ctx: s.ctxState }; });
log('title    ', JSON.stringify(await st()));
await g.evaluate(() => fz.goto('story', { next: { players: 1, level: 1, seed: 5 } }));
await g.evaluate(() => fz.goto('play', { players: 1, level: 1, seed: 5 }));
await t.page.waitForTimeout(600);
log('play+0.6s', JSON.stringify(await st()));
// player opens pause menu and chooses QUIT (or alt-F4-ish equivalent): scene -> title
await g.evaluate(() => fz.goto('title'));
const rows = [];
for (let i = 0; i < 10; i++) { await t.page.waitForTimeout(500); rows.push({ t: ((i + 1) * 0.5).toFixed(1), ...(await st()) }); }
for (const r of rows) log(JSON.stringify(r));
const bug = rows.some((r) => r.scene === 'title' && r.music && r.music.startsWith('stage'));
log('BUG_REPRODUCED (stage music on title screen) =', bug);
log('errors', t.errors);
await t.close();
