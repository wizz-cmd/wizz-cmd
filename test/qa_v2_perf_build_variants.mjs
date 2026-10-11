// Builds the prototype variants (own copies under out/qa_v2/perf/variants/, never src/ or dist/).
import fs from 'fs';
import { HTML } from './qa_v2_perf_lib.mjs';
import { makeVariant } from './qa_v2_perf_patch.mjs';
const SRC = fs.readFileSync(HTML, 'utf8');
/** whole top-level (2-space indented) function text starting at `head` */
function fnText(head) {
  const i = SRC.indexOf(head);
  if (i < 0) throw new Error('fn not found ' + head);
  const j = SRC.indexOf('\n  }\n', i);
  return SRC.slice(i, j + 5);
}
export const E = {};
// ---- q1 = vignette only (what FIXPLAN V10a decides) : the baseline the other post-FX prototypes are compared against
E.q1vig = [[
  `try { if (postMode === 'neon') N.bloom(ctx, W, H, { shift: q >= 2 ? 2 : 3 }); else bloomFast(ctx, W, H, q); } catch (e) { warnOnce('bloom', 'bloom failed: ' + (e && e.message)); }`,
  `try { if (q >= 2) { if (postMode === 'neon') N.bloom(ctx, W, H, { shift: 2 }); else bloomFast(ctx, W, H, q); } } catch (e) { warnOnce('bloom', 'bloom failed: ' + (e && e.message)); }`]];
// ---- vignette + grain as a CSS overlay on #frame (no full-canvas pass)
E.cssOverlay = [
  [`    ctx.drawImage(overlayFor(W, H, q >= 2), 0, 0, W, H);\n`, `    cssOverlay(q);\n`],
  [`    if (q <= 0) return;\n    const W = ctx.canvas.width, H = ctx.canvas.height;`, `    if (q <= 0) { cssOverlay(0); return; }\n    const W = ctx.canvas.width, H = ctx.canvas.height;`],
  [`  function postFX(ctx, quality) {`, `  let _cssQ = -1, _frameEl = null;
  function cssOverlay(q) {
    if (q === _cssQ) return;
    _cssQ = q;
    if (!_frameEl) _frameEl = document.getElementById('frame');
    if (!_frameEl) return;
    if (!_frameEl.style.getPropertyValue('--grain')) {
      const t = document.createElement('canvas'); t.width = 128; t.height = 128;
      const g = t.getContext('2d'), im = g.createImageData(128, 128), R = N.rng(99);
      for (let i = 0; i < im.data.length; i += 4) { const v = R.next() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.round(255 * 0.011 * (0.4 + 0.6 * R.next())); }
      g.putImageData(im, 0, 0);
      _frameEl.style.setProperty('--grain', 'url(' + t.toDataURL('image/png') + ')');
    }
    _frameEl.setAttribute('data-q', String(q));
  }
  function postFX(ctx, quality) {`],
  [`</style>\n</head>`, `  #frame::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:2px;background:radial-gradient(ellipse 71.7% 82% at 50% 50%,rgba(2,3,8,0) 41.5%,rgba(2,3,8,.62) 100%)}
  #frame[data-q="0"]::after{display:none}
  #frame[data-q="2"]::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;background-image:var(--grain);background-size:128px 128px}
</style>\n</head>`],
];
// ---- bloom layer as its own low-res canvas element blended by the compositor (mix-blend-mode), no full-res 'lighter' blit
E.bloomDom = [
  [`      const [, mg] = bwk('gb_m', w2, h2);`, `      const mg = domBloom(w2, h2);`],
  [`    const mid = bpool.get('gb_m');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
`, ``],
  [`  function bloomFast(ctx, W, H, q) {`, `  function domBloom(w, h) {
    let c = bpool.get('gb_m');
    if (!c) { c = document.getElementById('bloomc'); bpool.set('gb_m', c); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    return g;
  }
  function bloomFast(ctx, W, H, q) {`],
  [`    <canvas id="screen" width="256" height="224" role="img" aria-label="Fizz and Pop game screen"></canvas>`, `    <canvas id="screen" width="256" height="224" role="img" aria-label="Fizz and Pop game screen"></canvas>
    <canvas id="bloomc" width="4" height="4"></canvas>`],
  [`</style>\n</head>`, `  #bloomc{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:plus-lighter;border-radius:2px}
  #frame:not([data-q="2"]) #bloomc{display:none}
</style>\n</head>`],
];
// ---- auto quality that also sees late frames (rAF interval), not just the JS cost of the rAF callback
E.autoQdt = [[
  `      if (this.skip > 0) { this.skip--; return; }
      this.sum += cost; this.n++; this.span += dt; this.clock += dt;
      this.fBuf.push(cost); this.fSpan += dt;`,
  `      if (this.skip > 0) { this.skip--; return; }
      const dts = this.dts || (this.dts = []);
      dts.push(dt); if (dts.length > 90) dts.shift();
      let R = 1e9; for (let i = 0; i < dts.length; i++) if (dts[i] < R) R = dts[i];
      R = Math.max(R, 6);
      const eff = dt > R * 1.45 && this.dts.length >= 30 ? Math.max(cost, dt - R * 0.25) : cost;       // PROTOTYPE: a late frame counts with its real interval
      this.sum += eff; this.n++; this.span += dt; this.clock += dt;
      this.fBuf.push(eff); this.fSpan += dt;`]];
// ---- sprite / text / world bake at the exact (0.25-quantised) k instead of the 10 coarse buckets; world caps lifted
E.kExact = [
  [`const bucketOf = (k) => { for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= k * 0.94) return BUCKETS[i]; return 8; };`, `const bucketOf = (k) => Math.min(8, Math.max(1, k));`],
  [`const levelScale = () => Math.min(KB, 6);`, `const levelScale = () => KB;`],
  [`const bgScale = () => Math.min(KB, 4);`, `const bgScale = () => KB;`],
];
// world caps lifted only (what V10b alone does, to separate it from the sprite part)
E.worldExact = [
  [`const levelScale = () => Math.min(KB, 6);`, `const levelScale = () => K || KB;`],
  [`const bgScale = () => Math.min(KB, 4);`, `const bgScale = () => K || KB;`],
];
// ---- shockwave rings stroked with source-over instead of 'lighter'
E.ringOver = [[`    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = 3.2;`, `    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = 3.2;`]];
// ---- particles baked at a (quantised) device size and blitted 1:1 on the device grid
E.partQ = [[fnText('  function particle(ctx, kind, x, y, size, color, alpha, rot) {'), `  function particle(ctx, kind, x, y, size, color, alpha, rot) {
    alpha = alpha === undefined ? 1 : alpha;
    if (!(alpha > 0.003) || !(size > 0) || !KINDS[kind]) return;
    if (!K) autoScale(ctx);
    const c = colorOf(color === undefined ? '#fff' : color);
    const e = PART_E[kind];
    const need = size * 2 * e * K;                                  // device px of the sprite at this size
    let P = 8; while (P < need * 0.96 && P < 512) P = Math.ceil(P * 1.09);   // ~9 % steps (device size, not a power of two)
    P = P + (P & 1);
    const key = kind + '|' + ((c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3)) + '|' + P;
    let cv = partCache.get(key);
    if (cv) { partCache.delete(key); partCache.set(key, cv); }
    else {
      if (partCache.size >= 480) { const k0 = partCache.keys().next().value; const o = partCache.get(k0); o.width = 1; o.height = 1; partCache.delete(k0); }
      cv = bakeParticle(kind, [c[0] >> 3 << 3 | 4, c[1] >> 3 << 3 | 4, c[2] >> 3 << 3 | 4], P);
      partCache.set(key, cv);
    }
    const iK = 1 / K, dw = cv.width * iK, dh = cv.height * iK;
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * alpha * c[3];
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(cv, -dw / 2, -dh / 2, dw, dh); ctx.restore(); }
    else ctx.drawImage(cv, Math.round((x - dw / 2) * K) * iK, Math.round((y - dh / 2) * K) * iK, dw, dh);
    ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
  }
`]];
// ---- flipped sprites blit a cached mirrored copy (plain 1:1 blit) instead of save/translate/scale/restore
E.flipBake = [[fnText('  function blit(ctx, e, cv, x, y, o, w) {'), `  const mirrors = new WeakMap();
  function mirrorOf(cv) {
    let m = mirrors.get(cv);
    if (m) return m;
    m = makeCanvas(cv.width, cv.height);
    const g = m.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0);
    mirrors.set(cv, m);
    state.px += cv.width * cv.height;
    return m;
  }
  function blit(ctx, e, cv, x, y, o, w) {
    const kb = KB, iK = 1 / (K || kb);
    const sx = Math.round(x / iK) * iK, sy = Math.round(y / iK) * iK;
    const dw = e.w / kb, dh = e.h / kb, dy = sy - e.pt / kb;
    const a = o.alpha === undefined ? 1 : o.alpha;
    const ga = ctx.globalAlpha;
    if (a !== 1) { ctx.globalAlpha = ga * (a < 0 ? 0 : a); }
    if (o.flip) ctx.drawImage(mirrorOf(cv), sx - e.pr / kb, dy, dw, dh);          // mirrored about the box centre: the pad margins swap sides
    else ctx.drawImage(cv, sx - e.pl / kb, dy, dw, dh);
    if (a !== 1) ctx.globalAlpha = ga;
  }
`]];
// ---- warm-up pump driven by rAF (4 ms per frame) instead of requestIdleCallback
E.warmRaf = [[fnText('  function scheduleWarm() {'), `  function scheduleWarm() {
    if (warmHandle || !warmQ.length || !initDone) return;
    const run = () => {
      warmHandle = 0;
      if (!K) return;
      if (typeof document !== 'undefined' && document.hidden) { scheduleWarm(); return; }
      warmStep(window.__WARM_MS || 4);
      scheduleWarm();
    };
    try { warmHandle = requestAnimationFrame(run); } catch (e) { warmHandle = 0; }
  }
`]];
// ---- no duplicate renders on displays faster than the 60 Hz update: skip the render of a rAF frame that ran no update step (unless the last render is old)
E.hzCap = [
  [`    let ok = true;
    if (frozen) acc = 0;
    else {
      acc += dt;
      let steps = 0;
      while (acc >= STEP_MS && steps < MAX_CATCHUP) {
        ok = guarded('update', () => tick(true)) && ok;
        acc -= STEP_MS; steps++;
      }
      if (steps === MAX_CATCHUP) acc = 0;                 // drop the backlog after a long stall
    }
    ok = guarded('render', render) && ok;`, `    let ok = true, stepsRun = 0;
    if (frozen) acc = 0;
    else {
      acc += dt;
      let steps = 0;
      while (acc >= STEP_MS && steps < MAX_CATCHUP) {
        ok = guarded('update', () => tick(true)) && ok;
        acc -= STEP_MS; steps++;
      }
      if (steps === MAX_CATCHUP) acc = 0;                 // drop the backlog after a long stall
      stepsRun = steps;
    }
    if (frozen || stepsRun > 0 || c0 - (window.__lastRenderAt || 0) > 12) { window.__lastRenderAt = c0; ok = guarded('render', render) && ok; }`]];
// ---- static / near-static scenes render at a reduced rate: paused game 15 Hz, menu-like scenes 30 Hz, play 60 Hz (+ duplicate-render skip of hzCap)
E.idleRate = [
  [E.hzCap[0][0], E.hzCap[0][1].replace("if (frozen || stepsRun > 0 || c0 - (window.__lastRenderAt || 0) > 12) {", "const gate = scene === 'play' ? (paused ? 66 : 12) : 30; if (frozen || (stepsRun > 0 && c0 - (window.__lastRenderAt || 0) > gate - 12) || c0 - (window.__lastRenderAt || 0) > gate + 4) {")]];
// ---- warm-up driven by the headroom of the frame that just ran (Main.frame), not by requestIdleCallback
E.warmHead = [[`    const cost = performance.now() - c0;
    costs[costI] = cost;`, `    const cost = performance.now() - c0;
    if (cost < 11 && !frozen && typeof GFX._warmNow === 'function') GFX._warmNow(Math.min(4, 13 - cost));
    costs[costI] = cost;`]];
E.warmTimeoutFix = [[`      const rem = deadline && deadline.timeRemaining ? deadline.timeRemaining() : WARM_SLICE_MS;
      if (rem >= 2) warmStep(Math.min(WARM_SLICE_MS, rem - 1));`, `      const rem = deadline && deadline.timeRemaining ? deadline.timeRemaining() : WARM_SLICE_MS;
      if (deadline && deadline.didTimeout) warmStep(3);
      else if (rem >= 2) warmStep(Math.min(WARM_SLICE_MS, rem - 1));`]];
// ---- start-up probe (4 full-frame 'lighter' blits + one flush, ~10-20 ms) picks the initial quality / resolution cap before the first real frame
E.calibrate = [[`    quality = coarse ? 1 : 2;                                   // SPEC_V2 sec. 1: start at 1 on coarse-pointer devices, 2 elsewhere
    fit();                                                       // size the backing store (k) and tell GFX before the first paint
    drawLoading();`, `    quality = coarse ? 1 : 2;                                   // SPEC_V2 sec. 1: start at 1 on coarse-pointer devices, 2 elsewhere
    fit();                                                       // size the backing store (k) and tell GFX before the first paint
    try {
      const W = canvas.width, H = canvas.height, src = document.createElement('canvas');
      src.width = W; src.height = H; const sg = src.getContext('2d'); sg.fillStyle = 'rgba(30,60,90,0.5)'; sg.fillRect(0, 0, W, H);
      const g = ctx; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter';
      g.drawImage(src, 0, 0); g.getImageData(0, 0, 1, 1);
      const t0 = performance.now(); for (let i = 0; i < 4; i++) g.drawImage(src, 0, 0); g.getImageData(0, 0, 1, 1);
      const probe = (performance.now() - t0) / 4; g.restore();
      src.width = 1; src.height = 1;
      window.__probeMs = probe;
      const B = 11;                                              // ms budget per frame (the 12 ms drop threshold with a little headroom)
      if (15 * probe > B) quality = Math.min(quality, 1);
      if (14 * probe > B) quality = Math.min(quality, 0);
      if (7 * probe > B) { const want = K * Math.sqrt(B / (7 * probe)); let b = 0; for (const gk of GFX_BUCKETS) if (gk <= want + 1e-6 && gk >= K_CAP_MIN) b = gk; setKCap(b || K_CAP_MIN, 'probe'); }
    } catch (e) { /* no probe */ }
    drawLoading();`]];
// ---- bloom refresh pipelined over two frames (A: downsample + threshold + mips, B: blur + merge) instead of all in every 2nd frame
E.bloomPipe = [
  [`    const fresh = bloomSt.key !== key || bloomSt.tick % period === 0 || !bpool.get('gb_m');
    bloomSt.tick++; bloomSt.key = key;
    if (fresh) {
      let w = w2, h = h2;`, `    const first = bloomSt.key !== key || !bpool.get('gb_m');
    const doA = first || bloomSt.tick % 2 === 0, doB = first || bloomSt.tick % 2 === 1;
    bloomSt.tick++; bloomSt.key = key;
    if (doA || doB) {
      let w = w2, h = h2, levels = null;
      if (doA) {`],
  [`      const levels = [src];
      for (let i = 1; i < BLOOM_CFG.length; i++) {
        w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
        const [c, cg] = bwk('gb_' + i, w, h); cg.globalCompositeOperation = 'copy'; cg.drawImage(levels[i - 1], 0, 0, w, h); levels.push(c);
      }
      let acc = null;`, `      levels = [src];
      for (let i = 1; i < BLOOM_CFG.length; i++) {
        w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
        const [c, cg] = bwk('gb_' + i, w, h); cg.globalCompositeOperation = 'copy'; cg.drawImage(levels[i - 1], 0, 0, w, h); levels.push(c);
      }
      bloomSt.levels = levels;
      } else levels = bloomSt.levels;
      if (doB) {
      let acc = null;`],
  [`      mg.globalCompositeOperation = 'copy'; mg.drawImage(acc, 0, 0, w2, h2);
    }`, `      mg.globalCompositeOperation = 'copy'; mg.drawImage(acc, 0, 0, w2, h2);
      }
    }`],
];
// ---- static world composite: bg + level canvas merged ONCE per (round, k) into one canvas -> one blit; the full-frame clear shrinks to the HUD band; ambient drawn above the level
E.worldComp = [
  [`    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.save();`, `    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, C.W, MAP_Y);
    ctx.save();`],
  [`    drawBackdrop(ctx, S.level - 1, MAP_Y);
    drawAmbient(ctx, S.level - 1);
    ctx.drawImage(GFX.levelCanvas(S.level - 1, S.map), 0, MAP_Y, C.W, MAP_H);`, `    ctx.drawImage(worldComp(ctx, S.level - 1, S.map), 0, MAP_Y, C.W, MAP_H);
    drawAmbient(ctx, S.level - 1);`],
  [`  function renderPlayfield(ctx) {`, `  const WC = { cv: null, key: '' };
  function worldComp(ctx, li, map) {
    const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
    const bg = GFX.bgCanvas(li), lv = GFX.levelCanvas(li, map);
    const key = li + '|' + k + '|' + bg.width + 'x' + lv.width + '|' + (map ? map.length : 0) + (map && map[3] ? map[3] : '');
    if (WC.key !== key || !WC.cv) {
      if (!WC.cv) WC.cv = document.createElement('canvas');
      WC.cv.width = Math.round(C.W * k); WC.cv.height = Math.round(MAP_H * k);
      const g = WC.cv.getContext('2d');
      g.drawImage(bg, 0, 0, WC.cv.width, WC.cv.height);
      g.drawImage(lv, 0, 0, WC.cv.width, WC.cv.height);
      WC.key = key;
    }
    return WC.cv;
  }
  function renderPlayfield(ctx) {`],
];
export function build(name, ...keys) { return makeVariant(name, keys.flatMap((k) => E[k])); }
if (process.argv[1] && process.argv[1].endsWith('qa_v2_perf_build_variants.mjs')) {
  const defs = {
    q1vig: ['q1vig'],
    css: ['q1vig', 'cssOverlay'],
    cssbloom: ['q1vig', 'cssOverlay', 'bloomDom'],
    autoqdt: ['autoQdt'],
    kexact: ['kExact'],
    worldexact: ['worldExact'],
    ringover: ['ringOver'],
    partq: ['partQ'],
    flipbake: ['flipBake'],
    warmraf: ['warmRaf'],
    hzcap: ['hzCap'],
    worldcomp: ['worldComp'],
    recx: ['q1vig', 'kExact', 'ringOver', 'partQ', 'autoQdt', 'hzCap', 'bloomPipe', 'warmHead', 'worldComp'],
    rec: ['q1vig', 'kExact', 'ringOver', 'partQ', 'autoQdt', 'hzCap', 'calibrate', 'bloomPipe', 'warmHead'],
    recnocal: ['q1vig', 'kExact', 'ringOver', 'partQ', 'autoQdt', 'hzCap', 'bloomPipe', 'warmHead'],
    bloompipe: ['bloomPipe'],
    calib: ['calibrate'],
    warmhead: ['warmHead'],
    warmtimeout: ['warmTimeoutFix'],
    idlerate: ['idleRate'],
    allsafe: ['q1vig', 'kExact', 'ringOver', 'partQ', 'flipBake', 'warmRaf', 'autoQdt'],
    allcss: ['q1vig', 'cssOverlay', 'bloomDom', 'kExact', 'ringOver', 'partQ', 'flipBake', 'warmRaf', 'autoQdt'],
  };
  for (const [n, keys] of Object.entries(defs)) console.log(n, build(n, ...keys));
}
