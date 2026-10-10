// QA (audio lens) -- externally suspended / interrupted AudioContext (iOS call/siri/lock, OS audio-session loss, devtools):
// does ANY user gesture bring the sound back?  We suspend the context from outside through the analyser tap's .context.
//   node test/qa_audio_interrupt.mjs
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
const st = () => g.evaluate(() => { const s = fz.AUDIO._state(); return { ctx: s.ctxState, paused: s.paused, music: s.music, scene: fz.scene(), ready: fz.AUDIO.ready() }; });
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(500);
console.log('start        ', JSON.stringify(await st()));
await g.evaluate(() => { fz.AUDIO._tap().context.suspend(); });
await t.page.waitForTimeout(300);
console.log('suspended    ', JSON.stringify(await st()));
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(500);
console.log('after keydown', JSON.stringify(await st()));
await t.page.mouse.click(300, 300); await t.page.waitForTimeout(500);
console.log('after click  ', JSON.stringify(await st()));
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(800);
console.log('after Enter  ', JSON.stringify(await st()));
const recovered = (await st()).ctx === 'running';
console.log(recovered ? 'RECOVERED by gesture' : 'NOT RECOVERED: audio stays dead until a blur/focus or visibility change');
// does a blur/focus cycle fix it?
await g.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
await t.page.waitForTimeout(600);
console.log('after blur+focus', JSON.stringify(await st()));
await t.close();
