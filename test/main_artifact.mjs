// FIZZ & POP — Artifact fragment test (FIXPLAN section 0 / 5: build.sh also emits dist/fizzpop.artifact.html).
// The fragment is <title> + <style> blocks + body markup + the script, with no doctype / html / head / body tags (the Artifact
// host wraps it in its own skeleton). This test
//   1. rebuilds (flock'ed, like every fixer) and checks the fragment's structure,
//   2. loads it inside a MINIMAL doctype skeleton (a typical host: charset + viewport + root padding) and boots it with zero errors,
//   3. plays a few frames, screenshots it in several viewports / DPRs / colour schemes,
//   4. loads the skeleton page in a sandboxed CROSS-ORIGIN iframe (what a claude.ai Artifact is) and checks it runs there too.
// Usage: node test/main_artifact.mjs            -> out/main/artifact/*.png     (exit 1 on any failure)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import { launch, canvasShot, pageShot, fp, PROJECT } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'main', 'artifact');
const FRAG = path.join(PROJECT, 'dist', 'fizzpop.artifact.html');
const FULL = path.join(PROJECT, 'dist', 'fizzpop.html');
fs.mkdirSync(OUT, { recursive: true });

let failed = 0, passed = 0;
const check = (name, cond, extra = '') => {
  if (cond) passed++; else failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. build + structure -------------------------------------------------------------------------------------
if (!process.argv.includes('--no-build')) {
  try { execFileSync('flock', ['/tmp/fizzpop.build.lock', path.join(PROJECT, 'build.sh')], { stdio: 'pipe' }); check('build.sh succeeds', true); }
  catch (e) { check('build.sh succeeds', false, String(e.stderr || e)); }
}
const frag = fs.readFileSync(FRAG, 'utf8');
const bare = frag.replace(/<script>[\s\S]*?<\/script>/g, '<script/>');
check('fragment exists and fits the v2 bundle budget (SPEC_V2 sec. 5: <= 1.5 MB)', frag.length > 100000 && frag.length < 1.5 * 1024 * 1024, String(frag.length));
check('fragment starts with the <title>', /^<title>Fizz &amp; Pop<\/title>/.test(frag));
check('no doctype / html / head / body / meta tags outside the script', !/<(!doctype|html|head|body|meta)\b/i.test(bare), (bare.match(/<(!doctype|html|head|body|meta)\b/ig) || []).join(','));
check('has <style> blocks, the canvas, the touch controls and exactly one script', /<style>/.test(bare) && /<canvas id="screen"/.test(bare) && /id="touch"/.test(bare) && (frag.match(/<script>/g) || []).length === 1);
check('script is last, after the markup', frag.lastIndexOf('<script>') > frag.indexOf('id="touch"'));
check('dist/fizzpop.html is still a full standalone document', /^<!DOCTYPE html>/i.test(fs.readFileSync(FULL, 'utf8')));
check('no external resources (src= / href= / url(http / @import)', !/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(bare) && !/url\(\s*["']?https?:/i.test(bare) && !/@import/i.test(bare));

// ---- 2. minimal skeleton -----------------------------------------------------------------------------------
const SKEL = (inner, extraCss = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{ padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }${extraCss}</style>
</head><body>
${inner}
</body></html>`;
const skelPath = path.join(PROJECT, 'test', 'out', 'main_artifact_skeleton.html');
fs.mkdirSync(path.dirname(skelPath), { recursive: true });
fs.writeFileSync(skelPath, SKEL(frag));

async function boot(opts = {}) {
  const t = await launch({ html: skelPath, ...opts });
  t.g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop, null, { timeout: 10000 });
  return t;
}

{
  const t = await boot({ viewport: { width: 1280, height: 800 } });
  const g = t.g;
  check('skeleton: boots into the title scene', (await g.scene()) === 'title');
  check('skeleton: document.title is "Fizz & Pop" (the fragment carries its own title)', (await t.page.title()) === 'Fizz & Pop');
  const lay = await g.evaluate(() => fz._main.layout());
  check('skeleton: canvas laid out at x3 with the legend', lay.scale === 3 && lay.legend === true, JSON.stringify(lay));
  check('skeleton: dark page tokens exist (body has an explicit background)', await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await g.freeze(true);
  await g.start(1, 1, 7);
  await g.step(150);
  const st = await g.state();
  check('skeleton: a game runs (Game.start from the fragment, 150 frames)', st.frame > 100 && st.players.length === 1, JSON.stringify({ f: st.frame }));
  await canvasShot(t.page, path.join(OUT, 'skeleton_play.png'));
  await pageShot(t.page, path.join(OUT, 'skeleton_page_1280x800.png'));
  await g.goto('title'); await g.step(30);
  await g.goto('ending', { res: { won: true, level: 30, scores: [1000, 0], players: 1 }, entries: [] }); await g.step(100);
  await g.goto('title');
  check('skeleton: zero console / page errors', t.errors.length === 0, JSON.stringify(t.errors));
  await t.close();
}

for (const [w, h, dpr, touch, scheme, name] of [
  [390, 844, 3, true, 'dark', 'phone-390x844@3-dark'], [360, 740, 2, true, 'light', 'phone-360x740@2-light'], [412, 915, 2.625, true, 'dark', 'phone-412x915'],
  [844, 390, 3, true, 'dark', 'landscape-844x390'], [768, 1024, 2, true, 'light', 'tablet-768x1024'], [1920, 1080, 1, false, 'dark', 'desktop-1920x1080'],
]) {
  const t = await boot({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, touch, colorScheme: scheme });
  await t.g.freeze(true);
  await t.g.step(20);
  const m = await t.page.evaluate(() => {
    const b = document.getElementById('screen').getBoundingClientRect();
    return { x: b.x, y: b.y, r: b.right, b: b.bottom, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, lay: window.__fizzpop._main.layout() };
  });
  check(`${name}: picture inside the viewport, no scroll`, m.x >= 0 && m.y >= 0 && m.r <= w + 0.5 && m.b <= h + 0.5 && m.sw <= w && m.sh <= h + 1, JSON.stringify(m));
  await pageShot(t.page, path.join(OUT, `skeleton_${name}.png`));
  check(`${name}: zero errors`, t.errors.length === 0, JSON.stringify(t.errors));
  await t.close();
}

// ---- 4. sandboxed cross-origin iframe ------------------------------------------------------------------------------
function serve(map) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const e = map[req.url.split('?')[0]];
      if (!e) { rsp.writeHead(404); rsp.end('nf'); return; }
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rsp.end(e);
    });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((r) => srv.close(r)) }));
  });
}
for (const [w, h, touch, name] of [[900, 700, false, 'desktop'], [390, 844, true, 'phone']]) {
  const game = await serve({ '/game.html': SKEL(frag) });
  const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#222"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
  const t = await launch({ html: `http://127.0.0.1:${host.port}/`, viewport: { width: w, height: h }, touch, deviceScaleFactor: touch ? 2 : 1 });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = t.page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
  await frame.waitForFunction(() => !!window.__fizzpop, null, { timeout: 10000 });
  await wait(600);
  const info = await frame.evaluate(() => { window.fz = window.__fizzpop; return { scene: fz.scene(), overlay: !document.getElementById('focus').hidden, lay: fz._main.layout(), title: document.title }; });
  check(`iframe ${name}: boots into the title; ${info.overlay ? 'the click-to-play overlay is up (no focus yet)' : 'no overlay'}`, info.scene === 'title' && info.lay.w > 100, JSON.stringify(info));
  await t.page.mouse.click(w / 2, h / 3);
  await wait(300);
  await frame.evaluate(() => { fz.start(1, 2, 3); });
  await wait(1200);
  const st = await frame.evaluate(() => ({ scene: fz.scene(), frame: fz.Game.debug.state().frame, overlay: !document.getElementById('focus').hidden, paused: fz._main.paused() }));
  check(`iframe ${name}: the game runs inside the sandboxed cross-origin frame`, st.scene === 'play' && st.frame > 30, JSON.stringify(st));
  await pageShot(t.page, path.join(OUT, `iframe_${name}.png`));
  check(`iframe ${name}: zero console / page errors`, t.errors.length === 0, JSON.stringify(t.errors));
  await t.close(); await game.close(); await host.close();
}

console.log(`\n${failed ? failed + ' FAILED, ' : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
