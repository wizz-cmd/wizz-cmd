// QA v2 perf lens - shared helpers (own copy; no src edits)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HTML = path.join(PROJECT, 'dist', 'fizzpop.html');
export const OUT = path.join(PROJECT, 'out', 'qa_v2', 'perf');
fs.mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length || 1; return { n: s.length, avg: +(a.reduce((x, y) => x + y, 0) / n).toFixed(2), med: +(s[n >> 1] || 0).toFixed(2), p95: +(s[Math.floor(n * 0.95)] || 0).toFixed(2), p99: +(s[Math.floor(n * 0.99)] || 0).toFixed(2), max: +(s[n - 1] || 0).toFixed(1) }; };

export const K_VIEWS = { 1: [300, 300, 1], 2: [560, 560, 1], 3: [900, 760, 1], 3.25: [840, 740, 1], 3.75: [1920, 969, 1], 4: [1280, 1000, 1], 5: [1500, 1200, 1], 5.25: [2560, 1305, 1], 5.5: [1280, 700, 2], 6: [1024, 768, 2], 8: [1400, 1000, 2.5] };

export async function open({ html = process.env.VARIANT_HTML || HTML, vw = 1280, vh = 1000, dpr = 1, touch = false, cpu = 1, wait = true, args = [] } = {}) {
  const GPU_ARGS = process.env.GPU === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas'] : [];
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...GPU_ARGS, ...args] });
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: !!touch, isMobile: !!touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  const cdp = await context.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto('file://' + path.resolve(html));
  if (wait) await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 60000 });
  return { browser, context, page, cdp, errors, close: () => browser.close().catch(() => {}) };
}

export const BUSY = `(() => {
  window.fz = window.__fizzpop; const D = fz.Game.debug;
  fz.start(2, 8, 5); D.skipIntro(); D.god(true); const S = D._S(); D.clearEnemies();
  for (let i = 0; i < 8; i++) D.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 30 + i * 24, 60 + (i % 3) * 40);
  for (let i = 0; i < 38; i++) D.spawn(['thunder', 'fire', 'water'][i % 3], 24 + (i % 10) * 20, 40 + Math.floor(i / 10) * 30);
  for (const b of S.bubbles) { b.att = null; b.life = 1e9; }
  S.players[0].inv = 0; S.players[1].inv = 0; D.noClear(true);
})()`;
export const TYPICAL = `(() => { window.fz = window.__fizzpop; const D = fz.Game.debug; fz.start(1, 8, 5); D.skipIntro(); D.god(true); D.noClear(true); })()`;
// per-step hook that keeps the busy scene busy: players walk + shoot, periodic frozen-enemy bomb chain
export const DRIVE = (chain) => `(i) => {
  const D = fz.Game.debug, S = D._S();
  if (${chain ? 'true' : 'false'} && i % 12 === 0) { for (let k = 0; k < 6; k++) { D.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } D.give(0, 'bomb'); }
  fz.input.set(0, { right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1, fire: i % 6 < 3, jump: i % 40 === 0 });
  fz.input.set(1, { left: (i >> 5) % 2 === 0, right: (i >> 5) % 2 === 1, fire: i % 8 < 3 });
}`;

// ---- tracing helper: returns compact per-frame numbers from a CDP trace of the real rAF loop
export async function traceRun(t, secs = 5) {
  const chunks = [];
  t.cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
  const done = new Promise((r) => t.cdp.once('Tracing.tracingComplete', r));
  await t.page.evaluate(() => { window.__fr = window.__fr || []; window.__fr.length = 0; });
  await t.cdp.send('Tracing.start', { transferMode: 'ReportEvents', categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,v8.execute,blink,cc,gpu,viz,toplevel', options: 'sampling-frequency=10000' });
  await sleep(secs * 1000);
  await t.cdp.send('Tracing.end');
  await done;
  const fr = await t.page.evaluate(() => window.__fr.slice());
  const meta = {}, pmeta = {};
  for (const e of chunks) if (e.ph === 'M' && e.name === 'thread_name') meta[e.pid + ':' + e.tid] = e.args.name;
  for (const e of chunks) if (e.ph === 'M' && e.name === 'process_name') pmeta[e.pid] = e.args.name;
  const sum = (thread, name, filter) => { let ms = 0, n = 0, max = 0; for (const e of chunks) if (e.ph === 'X' && e.name === name && (meta[e.pid + ':' + e.tid] || '') === thread && (!filter || filter(e))) { ms += e.dur / 1000; n++; max = Math.max(max, e.dur / 1000); } return { ms, n, max }; };
  const bmf = sum('CrRendererMain', 'ProxyMain::BeginMainFrame');
  const raf = sum('CrRendererMain', 'FireAnimationFrame');
  const commit = sum('CrRendererMain', 'Commit');
  const prod = sum('CrRendererMain', 'CanvasResourceProviderSharedImage::ProduceCanvasResource');
  const minorGC = sum('CrRendererMain', 'MinorGC'), majorGC = sum('CrRendererMain', 'MajorGC');
  const v8gc = sum('CrRendererMain', 'V8.GC_SCAVENGER') ;
  const viz = sum('VizCompositorThread', 'Display::DrawAndSwap');
  const nF = Math.max(1, bmf.n);
  const busy = {};
  for (const e of chunks) if (e.ph === 'X' && e.dur && /^(ThreadControllerImpl::RunTask|ThreadPool_RunTask|RunTask)$/.test(e.name)) { const th = (pmeta[e.pid] || e.pid) + '/' + (meta[e.pid + ':' + e.tid] || e.tid); busy[th] = (busy[th] || 0) + e.dur / 1000; }
  const gpuBusy = {}; for (const [k, v] of Object.entries(busy)) if (/GPU Process/.test(k) || /CrRendererMain|Compositor/.test(k)) gpuBusy[k] = +(v / secs / 10).toFixed(1);
  let gcMs = 0, gcN = 0, gcMax = 0;
  for (const e of chunks) if (e.ph === 'X' && /^(MinorGC|MajorGC|V8\.GC_.*|BlinkGC.*)$/.test(e.name) && (meta[e.pid + ':' + e.tid] || '') === 'CrRendererMain' && /^(MinorGC|MajorGC)$/.test(e.name)) { gcMs += e.dur / 1000; gcN++; gcMax = Math.max(gcMax, e.dur / 1000); }
  return {
    frames: bmf.n, rAF: stat(fr),
    perFrame: { beginMainFrame: +(bmf.ms / nF).toFixed(2), rafJs: +(raf.ms / nF).toFixed(2), commit: +(commit.ms / nF).toFixed(2), canvasRaster: +(prod.ms / nF).toFixed(2), vizDrawAndSwap: +(viz.ms / nF).toFixed(2) },
    max: { beginMainFrame: +bmf.max.toFixed(1), raf: +raf.max.toFixed(1), canvasRaster: +prod.max.toFixed(1) },
    busyPct: gpuBusy,
    gc: { ms: +gcMs.toFixed(1), n: gcN, max: +gcMax.toFixed(1), perSecMs: +(gcMs / secs).toFixed(1) },
  };
}
