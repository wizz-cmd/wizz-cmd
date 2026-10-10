// QA platform: forced data-theme vs OS scheme (host's three theme states), applied after load; screenshots of the 4 combos.
import path from 'path'; import fs from 'fs';
import { launchBrowser, open, ev, OUT, log, DIST } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'artifact'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser({ autoplay: true });
for (const file of [DIST, path.join(D, 'nested.html')]) {
  for (const [cs, theme] of [['light', 'dark'], ['dark', 'light'], ['light', 'light'], ['dark', 'dark']]) {
    const t = await open({ browser, html: file, viewport: { width: 1280, height: 800 }, colorScheme: cs });
    await ev(t.page, (th) => { document.documentElement.setAttribute('data-theme', th); }, theme);
    await t.page.waitForTimeout(150);
    const r = await ev(t.page, () => ({ bodyBg: getComputedStyle(document.body).backgroundColor, key: getComputedStyle(document.querySelector('#legend kbd')).backgroundColor, cs: getComputedStyle(document.documentElement).colorScheme }));
    log(path.basename(file), `OS=${cs} data-theme=${theme}:`, JSON.stringify(r), 'errors', t.errors.length);
    if (file === DIST) await t.page.screenshot({ path: path.join(D, `theme_os-${cs}_forced-${theme}.png`), clip: { x: 0, y: 700, width: 1280, height: 100 } });
    await t.close();
  }
}
await browser.close();
