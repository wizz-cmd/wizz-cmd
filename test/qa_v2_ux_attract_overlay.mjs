// QA v2 (ux lens): the user reads the page for a while before clicking CLICK TO PLAY: where does the game stand behind the overlay (attract mode?) and what does the first key do?
import path from 'path';
import { open, OUT, wait } from './qa_v2_ux_lib.mjs';
const t = await open({ w: 1280, h: 800, dpr: 1, name: 'att', scheme: 'dark' });
const sc = () => t.ev(() => ({ scene: fz.scene(), sceneT: fz._main.sceneTime(), focusHidden: document.getElementById('focus').hidden, txt: document.getElementById('focus').innerText.replace(/\s+/g, ' ').trim() }));
for (const s of [3, 8, 12, 14, 18, 24]) {
  await wait(s === 3 ? 3000 : (s - (s === 8 ? 3 : s === 12 ? 8 : s === 14 ? 12 : s === 18 ? 14 : 18)) * 1000);
  console.log('t=' + s + 's', JSON.stringify(await sc()));
  if (s === 12) await t.page.screenshot({ path: path.join(OUT, 'att_t12_overlay.png') });
}
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.9]; });
const fr = await (await t.frame.frameElement()).boundingBox();
await t.page.mouse.click(fr.x + ov[0], fr.y + ov[1]);
await wait(800);
console.log('after click', JSON.stringify(await sc()));
await t.page.screenshot({ path: path.join(OUT, 'att_after_click.png') });
await t.key('Enter'); await wait(600);
console.log('after Enter', JSON.stringify(await sc()));
await t.key('Enter'); await wait(600);
console.log('after Enter 2', JSON.stringify(await sc()));
await t.close();
