// QA (audio lens) -- audio unlock inside a CROSS-ORIGIN iframe with Chromium's DEFAULT autoplay policy (no flags),
// optionally sandboxed (allow-scripts only => opaque origin, localStorage throws).  Two local http servers = two origins.
//   node test/qa_audio_iframe.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PROJECT } from '../tools/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const html = fs.readFileSync(path.join(PROJECT, 'dist', 'fizzpop.html'));
const mk = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
const child = await mk((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
const childPort = child.address().port;
const log = (...a) => console.log(...a);
const results = [];
const check = (n, ok, d) => { results.push(ok); log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '   ' + JSON.stringify(d) : '')); };

async function scenario(label, { sandbox, allow, input }) {
  log(`\n=== ${label}`);
  const parent = await mk((q, r) => {
    r.writeHead(200, { 'content-type': 'text/html' });
    r.end(`<!doctype html><body style="margin:0;background:#222"><button id=ext style="position:absolute;left:0;top:0">outside</button><iframe id=f src="http://localhost:${childPort}/" style="position:absolute;left:100px;top:40px;width:900px;height:700px;border:0" ${sandbox ? `sandbox="${sandbox}"` : ''} ${allow ? `allow="${allow}"` : ''}></iframe></body>`);
  });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });          // DEFAULT autoplay policy
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${parent.address().port}/`);
  await page.waitForTimeout(800);
  const fr = page.frames().find((f) => f !== page.mainFrame());
  const st = () => fr.evaluate(() => { const A = window.__fizzpop.AUDIO; return { audio: A._state(), stats: A._stats(), ready: A.ready(), focus: document.hasFocus(), overlay: !document.getElementById('focus').hidden, scene: window.__fizzpop.scene() }; });
  let s = await st();
  log('before any gesture:', JSON.stringify({ ctx: s.audio.ctxState, inited: s.audio.inited, music: s.audio.music, focus: s.focus, overlay: s.overlay }));
  check('no audio context created / nothing audible before the first gesture', !s.ready);
  // gesture
  const box = await page.locator('#f').boundingBox();
  if (input === 'click-overlay') await page.mouse.click(box.x + 400, box.y + 300);
  else if (input === 'canvas-click') { await page.mouse.click(box.x + 400, box.y + 300); }
  else if (input === 'key') { await page.evaluate(() => document.getElementById('f').focus()); await page.waitForTimeout(200); await page.keyboard.press('ArrowDown'); }
  else if (input === 'outside-then-click') { await page.click('#ext'); await page.waitForTimeout(300); await page.mouse.click(box.x + 400, box.y + 300); }
  await page.waitForTimeout(900);
  s = await st();
  log('after gesture:', JSON.stringify({ ctx: s.audio.ctxState, music: s.audio.music, paused: s.audio.paused, focus: s.focus, overlay: s.overlay, cur: s.stats.current, cnt: s.stats.curCount, scene: s.scene }));
  check('audio context running after the first gesture inside the iframe', s.audio.ctxState === 'running' && s.stats.curCount > 0, s.audio.ctxState);
  // really audible?
  const peak = await fr.evaluate(async () => { const tap0 = window.__fizzpop.AUDIO._tap(); if (!tap0) return -1; const tap = window.__fizzpop.AUDIO._tap(); const b = new Float32Array(tap.fftSize); let p = 0; for (let i = 0; i < 20; i++) { tap.getFloatTimeDomainData(b); for (const x of b) p = Math.max(p, Math.abs(x)); await new Promise((r) => setTimeout(r, 30)); } return p; });
  check('title music is producing signal at the output tap', peak > 0.02, +peak.toFixed(3));
  // sfx after gesture
  await fr.evaluate(() => { window.__fizzpop.AUDIO.sfx('pop'); });
  const g = await fr.evaluate(() => window.__fizzpop.AUDIO._stats().groups);
  check('sfx works after unlock', g >= 1, g);
  // mute persistence in sandbox (localStorage throws when opaque origin)
  await fr.evaluate(() => { window.__fizzpop.AUDIO.setMuted(true); });
  const mu = await fr.evaluate(() => window.__fizzpop.AUDIO.isMuted());
  check('mute toggle works (even if storage is unavailable)', mu === true);
  check('no console/page errors', errors.length === 0, errors);
  await browser.close(); parent.close();
}

await scenario('iframe cross-origin, plain', { sandbox: null, allow: null, input: 'canvas-click' });
await scenario('iframe cross-origin, keyboard gesture only', { sandbox: null, allow: null, input: 'key' });
await scenario('iframe cross-origin, click OUTSIDE first (blur) then inside', { sandbox: null, allow: null, input: 'outside-then-click' });
await scenario('iframe sandbox="allow-scripts" (opaque origin, no storage)', { sandbox: 'allow-scripts', allow: null, input: 'canvas-click' });
await scenario('iframe sandbox="allow-scripts allow-same-origin allow-popups"', { sandbox: 'allow-scripts allow-same-origin', allow: null, input: 'canvas-click' });
child.close();
log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(0);
