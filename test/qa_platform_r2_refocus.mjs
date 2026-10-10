// Iframe: play, click into the host's chat box (blur), click back on the game: is the game running again, or sitting in PAUSED?
import fs from 'fs';
import { launchBrowser, serve, DIST, OUT, sleep } from './qa_platform_r2_lib.mjs';
const game = await serve({ '/game.html': { body: fs.readFileSync(DIST, 'utf8') } });
const parent = await serve({ '/': { body: `<!doctype html><body style="margin:0"><input id=chat style="width:300px;margin:8px"><br><iframe id=f sandbox="allow-scripts allow-same-origin" src="http://127.0.0.1:${game.port}/game.html" style="width:800px;height:640px;border:0"></iframe>` } });
const browser = await launchBrowser({ autoplay: false });
const page = await (await browser.newContext({ viewport: { width: 900, height: 760 } })).newPage();
await page.goto(`http://127.0.0.1:${parent.port}/`); await sleep(700);
const frame = page.frames().find((f) => f.url().includes('game.html'));
const S = () => frame.evaluate(() => ({ overlay: !document.getElementById('focus').hidden, paused: window.__fizzpop._main.paused(), frame: window.__fizzpop.Game.debug.state().frame }));
await page.mouse.click(400, 300); await sleep(300);
await frame.evaluate(() => window.__fizzpop.start(1, 2, 1)); await sleep(3000);
console.log('playing                       ', JSON.stringify(await S()));
await page.click('#chat'); await sleep(800);
console.log('clicked host chat box         ', JSON.stringify(await S()));
await page.mouse.click(400, 300); await sleep(800);
console.log('clicked game ("Click to play")', JSON.stringify(await S()));
await page.screenshot({ path: OUT + '/refocus_paused.png' });
await page.keyboard.press('ArrowRight'); await sleep(300);
console.log('pressed ArrowRight            ', JSON.stringify(await S()), '(arrow in PAUSED menu only moves the cursor)');
await browser.close();
process.exit(0);   // wave-2 integration: the script's http servers (serve()) are never closed, so the process used to hang after the report
