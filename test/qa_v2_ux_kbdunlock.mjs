// QA v2 (ux lens): keyboard-only first gesture: Tab into the iframe, Enter / Space on the CLICK TO PLAY overlay -> audio running? focus overlay hidden?
import { open, wait } from './qa_v2_ux_lib.mjs';
for (const key of ['Enter', 'Space', 'ArrowDown', 'KeyZ']) {
  const t = await open({ w: 1280, h: 800, dpr: 1, name: 'kbd_' + key });
  await wait(1200);
  await t.page.keyboard.press('Tab'); await wait(200);
  const f1 = await t.ev(() => ({ active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), hasFocus: document.hasFocus(), focusHidden: document.getElementById('focus').hidden }));
  await t.page.keyboard.press(key); await wait(1200);
  const f2 = await t.ev(() => ({ active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), hasFocus: document.hasFocus(), focusHidden: document.getElementById('focus').hidden, scene: fz.scene(), sel: (fz._main.rows() || []).findIndex((r) => r.sel) }));
  console.log(key, 'after Tab', JSON.stringify(f1), 'after key', JSON.stringify(f2), JSON.stringify((await t.audio()).st.ctxState));
  await t.close();
}
