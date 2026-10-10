// FIZZ & POP — test/audio_board_smoke.mjs : loads the sound board, clicks buttons, screenshots, checks for console errors.
import path from 'path';
import { launch, pageShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'audio_board.html'), viewport: { width: 900, height: 700 } });
await t.page.click('#bInit');
await t.page.click('button[data-name="stage1"]');
await t.page.waitForTimeout(700);
await t.page.click('button[data-name="pop"]');
await t.page.click('button[data-name="start"]');
await t.page.waitForTimeout(500);
await pageShot(t.page, path.join(PROJECT, 'out', 'audio', 'board.png'));
const txt = await t.page.textContent('#stats');
console.log(txt);
console.log('errors:', t.errors);
await t.close();
process.exit(t.errors.length ? 1 : 0);
