// Same bug as qa_codereview_quit_jingle.mjs but through genuine keyboard input: Enter (1 PLAYER) -> Enter (skip story) -> Esc, Down, Enter (QUIT)
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
const st = () => g.evaluate(() => { const s = fz.AUDIO._state(); return { scene: fz.scene(), music: s.music, jingle: s.jingle }; });
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(300);          // 1 PLAYER (also unlocks audio)
log('after Enter  ', JSON.stringify(await st()));
await t.page.waitForTimeout(500);
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(500);          // skip story -> play (start jingle begins)
log('in play      ', JSON.stringify(await st()));
await t.page.keyboard.press('Escape'); await t.page.waitForTimeout(150);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(150);
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(200);          // QUIT
log('quit -> title', JSON.stringify(await st()));
for (let i = 0; i < 8; i++) { await t.page.waitForTimeout(700); log(' +' + ((i + 1) * 0.7).toFixed(1) + 's', JSON.stringify(await st())); }
log('errors', t.errors);
await t.close();
