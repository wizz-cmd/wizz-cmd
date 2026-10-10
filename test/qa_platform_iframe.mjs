// QA platform: embed dist/fizzpop.html in a cross-origin sandboxed iframe (as an Artifact host would) and test the
// focus flow, click-to-play overlay, audio unlock (REAL autoplay policy), keyboard/pointer, localStorage, gamepad policy.
import fs from 'fs'; import path from 'path';
import { launchBrowser, serve, DIST, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'iframe'); fs.mkdirSync(D, { recursive: true });
const html = fs.readFileSync(DIST, 'utf8');
const game = await serve({ '/game.html': { body: html } });
const variants = [
  ['sandbox_scripts', 'sandbox="allow-scripts"'],
  ['sandbox_scripts_same', 'sandbox="allow-scripts allow-same-origin"'],
  ['sandbox_scripts_same_gamepad', 'sandbox="allow-scripts allow-same-origin" allow="gamepad; autoplay; fullscreen"'],
  ['no_sandbox', ''],
];
const browser = await launchBrowser({ autoplay: false });
for (const [name, attrs] of variants) {
  const parent = await serve({ '/': { body: `<!doctype html><body style="margin:0;background:#fff"><input id="chat" placeholder="chat box" style="width:300px;margin:8px"><br><iframe id="f" ${attrs} src="http://127.0.0.1:${game.port}/game.html" style="width:800px;height:640px;border:1px solid #888"></iframe>` } });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 760 } });
  const page = await ctx.newPage();
  const errs = [], logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e));
  await page.goto(`http://127.0.0.1:${parent.port}/`);
  await page.waitForTimeout(800);
  const frame = page.frames().find((f) => f.url().includes('game.html'));
  const S = () => frame.evaluate(() => ({ focus: document.hasFocus(), overlayHidden: document.getElementById('focus').hidden, scene: window.__fizzpop.scene(), audioReady: window.__fizzpop.AUDIO.ready(), acState: (() => { try { return !!window.__fizzpop.AUDIO && 'n/a'; } catch (e) { return 'x'; } })(), origin: location.origin, ls: (() => { try { localStorage.setItem('t', '1'); return 'ok'; } catch (e) { return 'THROWS ' + e.name; } })(), pads: (() => { try { const g = navigator.getGamepads(); return 'ok:' + g.length; } catch (e) { return 'THROWS ' + e.name; } })(), paused: window.__fizzpop._main.paused() }));
  const s0 = await S();
  log(`\n== ${name}`); log('initial', JSON.stringify(s0));
  await page.screenshot({ path: path.join(D, `${name}_0_initial.png`) });
  // press keys while focus is in the parent (e.g. user typed in chat): the game must not react, overlay must show
  await page.focus('#chat'); await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const s1 = await S(); log('after Enter in parent chat box', JSON.stringify({ scene: s1.scene, overlayHidden: s1.overlayHidden, focus: s1.focus }));
  // click the overlay
  const box = await (await frame.frameElement()).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 200);
  await page.waitForTimeout(700);
  const s2 = await S(); log('after click in iframe', JSON.stringify({ focus: s2.focus, overlayHidden: s2.overlayHidden, audioReady: s2.audioReady }));
  await page.screenshot({ path: path.join(D, `${name}_1_clicked.png`) });
  // keyboard: Enter starts 1P (title menu), wait for story/play
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const s3 = await S(); log('Enter ->', s3.scene);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500); // skip story (after guard)
  await page.waitForTimeout(900); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const s4 = await S(); log('after skipping story ->', s4.scene);
  // in play: press Escape -> pause
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const s5 = await S(); log('Esc in iframe -> paused', s5.paused);
  // Click into parent chat box while playing -> blur pause + overlay
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('#chat'); await page.waitForTimeout(800);
  const s6 = await S(); log('focus moved to parent -> overlayHidden', s6.overlayHidden, 'paused', s6.paused, 'focus', s6.focus);
  await page.screenshot({ path: path.join(D, `${name}_2_blurred.png`) });
  log('console errors', JSON.stringify(errs)); log('console warnings', JSON.stringify(logs.filter((l) => /warning/.test(l)).slice(0, 6)));
  await ctx.close(); await parent.close();
}
// srcdoc embedding (common for hosts that inline the page)
{
  const srcdoc = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const ctx = await browser.newContext({ viewport: { width: 900, height: 760 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.setContent(`<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" srcdoc="${srcdoc}" style="width:800px;height:640px;border:0"></iframe>`);
  await page.waitForTimeout(1200);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const r = await frame.evaluate(() => ({ scene: __fizzpop.scene(), lay: __fizzpop._main.layout(), origin: location.origin, focus: document.hasFocus() }));
  log('\n== srcdoc sandbox', JSON.stringify(r), 'errors', JSON.stringify(errs));
  await page.screenshot({ path: path.join(D, 'srcdoc.png') });
  await ctx.close();
}
await browser.close(); await game.close();
