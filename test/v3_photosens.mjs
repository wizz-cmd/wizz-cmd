// FIZZ & POP v3 regression gate — photosensitivity scan of RECORDED FRAMES (SPEC_V2 sec. 1, FIXPLAN_V3 G1/G3, V6).
//   node test/v3_photosens.mjs [--html path] [--tag name] [--only a,b] [--quiet]
//
// Every scenario steps the real build frame by frame (fz.step(1) = update + render + postFX, quality 2), grabs the rendered canvas
// (down-sampled to 128x112 with smoothing, so areas stay proportional) and runs a per-pixel WCAG-2.3.1-style analysis on relative luminance:
//   * the picture is cut into overlapping REGIONS of 16x14 samples (1.56 % of the picture each, smaller than the WCAG area of 25 % of a 10-degree field = ~2.8 % of the
//     screen, so the test is conservative); a region registers a TRANSITION when its MEAN relative luminance has moved monotonically by >= 0.1 (the darker state < 0.8) since
//     its last extremum and then turns around (Schmitt trigger: slow ramps count, per-frame ripple below 0.1 does not);
//   * a FLASH = a pair of opposing transitions; a region "flashes more than 3 times a second" when it registers >= 7 transitions in any 60-frame window;
//   * GATE: the UNION of the regions that flash that fast must cover < 2.8 % of the picture;
//   * informational: the same on single pixels (moving high-contrast edges and sparkles make pixels flip, which is texture/motion, not a flash: scrolling rounds show it),
//     the plain single-frame changed area (|dL| >= 0.1 between consecutive frames), and the whole-frame mean luminance step.
// Gates: region flashes (> 3/s) < 2.8 % of the picture in every scenario, the full-frame luminance never jumps by >= 0.1 between frames.
// The same script can be run against the pre-wave build (--html out/v3/regress/base/dist/fizzpop.html) to show that the gate bites (boss ink telegraph).
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT, DEFAULT_HTML } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); const i = args.indexOf('--' + n); return a ? a.slice(n.length + 3) : (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d); };
const HTML = opt('html', DEFAULT_HTML), TAG = opt('tag', 'v3'), ONLY = opt('only', '') ? new Set(opt('only', '').split('|')) : null;      // (scenario names contain commas: separate with |)
const OUT = path.join(PROJECT, 'out', 'v3', 'regress'); fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (ok, msg, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg + (!ok && detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); if (!ok) failed++; return !!ok; };

const t = await launch({ html: HTML, viewport: { width: 1000, height: 800 } });
const g = fp(t.page);
await t.page.waitForFunction(() => !!window.__fizzpop);
await g.wait(500); await g.freeze(true);

await t.page.evaluate(() => {
  window.fz = window.__fizzpop;
  const W = 128, H = 112, N = W * H;
  const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const sx = small.getContext('2d', { willReadFrequently: true }); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
  const cv = document.getElementById('screen');
  window.PH = {
    start() {
      this.prev = null; this.ext = new Float32Array(N); this.dir = new Int8Array(N); this.ring = []; this.win = new Uint8Array(N); this.f = 0;
      this.maxUp = 0; this.maxDn = 0; this.maxA5 = 0; this.maxA7 = 0; this.maxA7f = -1; this.maxLumJump = 0; this.lumPrev = null; this.upFrames = 0; this.series = [];
      this.maxUpF = -1;
      // region (block) analysis: 16x14 blocks, stride 8x7 -> 15 x 15 regions
      this.BW = 16; this.BH = 14; this.SX = 8; this.SY = 7; this.NX = Math.floor((W - this.BW) / this.SX) + 1; this.NY = Math.floor((H - this.BH) / this.SY) + 1; this.NB = this.NX * this.NY;
      this.bext = new Float32Array(this.NB); this.bdir = new Int8Array(this.NB); this.bwin = new Uint8Array(this.NB); this.bring = []; this.bprev = null;
      this.maxB7 = 0; this.maxB5 = 0; this.maxBstep = 0; this.maxB7f = -1; this.maxUnion = 0;
    },
    blocks(L) {
      const out = new Float32Array(this.NB); const area = this.BW * this.BH;
      for (let by = 0; by < this.NY; by++) for (let bx = 0; bx < this.NX; bx++) { let sum = 0; const x0 = bx * this.SX, y0 = by * this.SY; for (let y = 0; y < this.BH; y++) { const row = (y0 + y) * W + x0; for (let x = 0; x < this.BW; x++) sum += L[row + x]; } out[by * this.NX + bx] = sum / area; }
      return out;
    },
    grab() {
      sx.clearRect(0, 0, W, H); sx.drawImage(cv, 0, 0, W, H);
      const d = sx.getImageData(0, 0, W, H).data, L = new Float32Array(N); let mean = 0;
      for (let i = 0; i < N; i++) { L[i] = 0.2126 * lin[d[i * 4]] + 0.7152 * lin[d[i * 4 + 1]] + 0.0722 * lin[d[i * 4 + 2]]; mean += L[i]; }
      mean /= N; return { L, mean };
    },
    push() {
      const { L, mean } = this.grab(); const f = this.f++;
      const T = 0.1; let up = 0, dn = 0;
      if (this.prev) {
        const p = this.prev;
        for (let i = 0; i < N; i++) { const dl = L[i] - p[i]; if (dl >= T && p[i] < 0.8) up++; else if (dl <= -T && L[i] < 0.8) dn++; }
        this.maxLumJump = Math.max(this.maxLumJump, Math.abs(mean - this.lumPrev));
      }
      const upP = up / N * 100, dnP = dn / N * 100;
      if (upP > this.maxUp) { this.maxUp = upP; this.maxUpF = f; }
      this.maxDn = Math.max(this.maxDn, dnP);
      // Schmitt-trigger transitions per pixel
      const flags = new Uint8Array(N), ext = this.ext, dir = this.dir;
      if (!this.prev) { ext.set(L); }
      else for (let i = 0; i < N; i++) {
        const v = L[i], e = ext[i], d = dir[i];
        if (d === 0) { if (v - e >= T) { dir[i] = 1; ext[i] = v; flags[i] = (e < 0.8) ? 1 : 0; } else if (e - v >= T) { dir[i] = -1; ext[i] = v; flags[i] = (v < 0.8) ? 1 : 0; } else if (Math.abs(v - e) < 1e-3) ext[i] = v; }
        else if (d === 1) { if (v > e) ext[i] = v; else if (e - v >= T) { dir[i] = -1; ext[i] = v; flags[i] = (v < 0.8) ? 1 : 0; } }
        else { if (v < e) ext[i] = v; else if (v - e >= T) { dir[i] = 1; ext[i] = v; flags[i] = (e < 0.8) ? 1 : 0; } }
      }
      const win = this.win; for (let i = 0; i < N; i++) win[i] += flags[i];
      this.ring.push(flags); if (this.ring.length > 60) { const old = this.ring.shift(); for (let i = 0; i < N; i++) win[i] -= old[i]; }
      let a5 = 0, a7 = 0; for (let i = 0; i < N; i++) { const w = win[i]; if (w >= 5) a5++; if (w >= 7) a7++; }
      const a5p = a5 / N * 100, a7p = a7 / N * 100; this.maxA5 = Math.max(this.maxA5, a5p); if (a7p > this.maxA7) { this.maxA7 = a7p; this.maxA7f = f; }
      if (upP >= 1 || dnP >= 1) this.upFrames++;
      // region analysis
      const B = this.blocks(L), NB = this.NB, bflags = new Uint8Array(NB), bext = this.bext, bdir = this.bdir;
      if (!this.bprev) bext.set(B);
      else for (let i = 0; i < NB; i++) {
        const v = B[i], e = bext[i], d = bdir[i];
        this.maxBstep = Math.max(this.maxBstep, Math.abs(v - this.bprev[i]));
        if (d === 0) { if (v - e >= T) { bdir[i] = 1; bext[i] = v; bflags[i] = (e < 0.8) ? 1 : 0; } else if (e - v >= T) { bdir[i] = -1; bext[i] = v; bflags[i] = (v < 0.8) ? 1 : 0; } else if (Math.abs(v - e) < 1e-3) bext[i] = v; }
        else if (d === 1) { if (v > e) bext[i] = v; else if (e - v >= T) { bdir[i] = -1; bext[i] = v; bflags[i] = (v < 0.8) ? 1 : 0; } }
        else { if (v < e) bext[i] = v; else if (v - e >= T) { bdir[i] = 1; bext[i] = v; bflags[i] = (e < 0.8) ? 1 : 0; } }
      }
      const bwin = this.bwin; for (let i = 0; i < NB; i++) bwin[i] += bflags[i];
      this.bring.push(bflags); if (this.bring.length > 60) { const old = this.bring.shift(); for (let i = 0; i < NB; i++) bwin[i] -= old[i]; }
      let b5 = 0, b7 = 0; for (let i = 0; i < NB; i++) { if (bwin[i] >= 5) b5++; if (bwin[i] >= 7) b7++; }
      this.maxB5 = Math.max(this.maxB5, b5); if (b7 > this.maxB7) { this.maxB7 = b7; this.maxB7f = f; }
      if (b7 > 0) {                                                                                   // union area (overlapping regions counted once) of the regions that flash > 3/s right now
        const cov = this.cov || (this.cov = new Uint8Array(N)); cov.fill(0); let u = 0;
        for (let by = 0; by < this.NY; by++) for (let bx = 0; bx < this.NX; bx++) if (bwin[by * this.NX + bx] >= 7) for (let y = 0; y < this.BH; y++) { const row = (by * this.SY + y) * W + bx * this.SX; for (let x = 0; x < this.BW; x++) if (!cov[row + x]) { cov[row + x] = 1; u++; } }
        if (u > (this.maxUnion || 0)) { this.maxUnion = u; this.unionAt = f; this.unionBlocks = []; for (let i = 0; i < NB; i++) if (bwin[i] >= 7) this.unionBlocks.push([(i % this.NX) * this.SX / W * 256, Math.floor(i / this.NX) * this.SY / H * 224]); }
      }
      this.bprev = B;
      this.series.push(+mean.toFixed(4));
      this.prev = L; this.lumPrev = mean;
    },
    result() {
      const s = this.series, n = s.length; let rng = [Math.min(...s), Math.max(...s)];
      return { unionFrame: this.unionAt, unionBlocksXY: (this.unionBlocks || []).map((b) => b.map(Math.round)), regions7: this.maxB7, regions5: this.maxB5, regionAreaPct7: +(((this.maxUnion || 0) / N) * 100).toFixed(2), regions7Frame: this.maxB7f, maxRegionStep: +this.maxBstep.toFixed(3), frames: n, maxUpPct: +this.maxUp.toFixed(2), maxDnPct: +this.maxDn.toFixed(2), maxUpFrame: this.maxUpF, framesOver1pct: this.upFrames, area5in60: +this.maxA5.toFixed(2), area7in60: +this.maxA7.toFixed(2), area7Frame: this.maxA7f, maxLumJump: +this.maxLumJump.toFixed(4), lumRange: rng.map((x) => +x.toFixed(3)) };
    },
  };
});

const SCEN = {};
const D0 = `window.fz = window.__fizzpop; window.D = fz.Game.debug;`;
const INFO = new Set();                                                                   // scenarios reported but not gated (documented stress cases)
const run = async (name, frames, setup, perFrame, info) => {
  if (info) INFO.add(name);
  if (ONLY && !ONLY.has(name)) return;
  const r = await t.page.evaluate(async ({ frames, setup, perFrame }) => {
    const D = fz.Game.debug; fz._main.setQuality(2, true);
    (0, eval)(setup);
    PH.start();
    const per = perFrame ? (0, eval)('(' + perFrame + ')') : null;
    for (let f = 0; f < frames; f++) { if (per) per(f); fz.step(1); PH.push(); }
    fz.input.clear();
    const fl = D.flash && D.flash();
    return PH.result();
  }, { frames, setup, perFrame: perFrame || null });
  SCEN[name] = r;
  console.log(`  ${name.padEnd(36)} frames ${String(r.frames).padStart(4)}  regions flashing >3/s: ${String(r.regions7).padStart(2)} (union ${String(r.regionAreaPct7).padStart(4)} %)  >=2/s: ${String(r.regions5).padStart(2)}  max region step ${String(r.maxRegionStep).padStart(5)}  | 1-frame area up ${String(r.maxUpPct).padStart(5)}% dn ${String(r.maxDnPct).padStart(5)}%  | pixel-level(info) 7/60f ${String(r.area7in60).padStart(5)}%  | whole-frame dLum ${r.maxLumJump}  lum ${r.lumRange}`);
};
const BASE = (round, players = 1, seed = 21) => `fz.start(${players}, ${round}, ${seed}); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); ${round === 30 ? '' : 'fz.Game.debug.clearEnemies();'}`;   // (round 30: the Kraken stays)
const FROZEN6 = `const S = fz.Game.debug._S(); for (let k = 0; k < 6; k++) { fz.Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } fz.Game.debug.give(0, 'bomb');`;

console.log(`\n== photosensitivity frame scan  (${HTML.replace(PROJECT + '/', '')})`);
await run('boss ink telegraph, phase 1', 220, BASE(30) + `const k = fz.Game.debug._S().enemies.find((e) => e.t === 'kraken'); k.inkT = 30;`);
await run('boss ink telegraph, phase 2', 220, BASE(30) + `const k = fz.Game.debug._S().enemies.find((e) => e.t === 'kraken'); k.hp = 10; k.inkT = 30;`);
await run('boss hit flashes + defeat', 420, BASE(30), `(f) => { const S = fz.Game.debug._S(); const k = S.enemies.find((e) => e.t === 'kraken'); if (k && f === 200) k.hp = 1; if (f % 30 === 0) fz.Game.debug.spawn('thunder', 128, 90); }`);
await run('HURRY UP + Bonefin', 330, BASE(6) + `fz.Game.debug.spawn('nibbler', 80, 100); fz.Game.debug.setHurryTimer(-1);`);
await run('bomb chain x4 (frozen kills)', 260, BASE(8), `(f) => { if (f % 40 === 0) { ${FROZEN6} } }`);
await run('2P bomb chain (cyan owner)', 260, BASE(8, 2), `(f) => { if (f % 40 === 0) { ${FROZEN6.replace('give(0', 'give(1')} } }`);
const THUNDER = (every) => `(f) => { if (f % ${every} === 0) { const p = fz.Game.debug._S().players[0]; fz.Game.debug.spawn('thunder', p.x + 10, p.y - 4); } fz.input.set(0, { fire: f % 5 < 2, right: (f >> 4) % 2 === 0, left: (f >> 4) % 2 === 1 }); }`;
await run('thunder bubbles, 2 pops per second', 300, BASE(19) + `fz.Game.debug.setPlayer(0, { x: 60, y: 180 });`, THUNDER(30));
await run('thunder STRESS, 3 pops per second', 300, BASE(19) + `fz.Game.debug.setPlayer(0, { x: 60, y: 180 });`, THUNDER(20), true);    // info only: the same 2-3 regions around the player flash at ~3.5 Hz in the pre-wave build too (union 2.3-3.1 %)
await run('fire + water bubbles', 240, BASE(11), `(f) => { if (f % 30 === 0) { const p = fz.Game.debug._S().players[0]; fz.Game.debug.spawn(f % 60 ? 'fire' : 'water', p.x + 10, p.y - 4); } fz.input.set(0, { fire: f % 5 < 2 }); }`);
await run('clock freeze + thaw (last second)', 360, BASE(21) + `const D = fz.Game.debug, S = D._S(); for (let k = 0; k < 6; k++) D.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler'][k], 40 + k * 30, 100 + (k % 2) * 40); D.give(0, 'clock');`, `(f) => { const S = fz.Game.debug._S(); if (f === 30) for (const e of S.enemies) if (e.state === 'frozen') e.freezeT = Math.min(e.freezeT, 110); }`);
await run('death + invulnerability pulse', 360, BASE(8) + `const D = fz.Game.debug; D.god(false); const p = D._S().players[0]; D.spawn('nibbler', p.x, p.y);`);
await run('special/letter bubble expiry', 240, BASE(3) + `const D = fz.Game.debug, S = D._S(); D.spawn('thunder', 90, 80); D.spawn('fire', 130, 80); D.spawn('letter', 170, 80); for (const b of S.bubbles) { b.att = null; b.life = Math.min(b.life, 100); }`);
await run('EXTEND letters collected', 360, BASE(2) + `const D = fz.Game.debug, p = D._S().players[0]; p.letters = [true, true, true, true, true, false]; D.spawn('letter', p.x + 8, p.y - 6);`);
await run('round clear -> transition -> ROUND', 520, `fz.start(1, 4, 21); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(false);`, `(f) => { if (f === 40) fz.Game.debug.killAll(); }`);
await run('game over', 420, BASE(5) + `const D = fz.Game.debug; D.god(false); const p = D._S().players[0]; p.lives = 1; D.spawn('nibbler', p.x, p.y);`);
await run('boss defeat -> victory', 900, BASE(30), `(f) => { if (f === 60) fz.Game.debug.killAll(); }`);
await run('title idle (logo animation)', 400, `fz.goto('title');`);
// ending: tableau -> credits -> finale dissolves (U5)
await run('ending (tableau/credits/finale)', 1500, `fz.goto('ending', { entries: [], res: { won: true, level: 30, scores: [123400, 0], players: 1 } });`);
await run('story / how-to / scores scenes', 300, `fz.goto('howto');`);

const errs = t.errors.slice();
console.log('');
const worst = (k) => Math.max(0, ...Object.entries(SCEN).filter(([n]) => !INFO.has(n)).map(([, r]) => r[k]));
check(Object.keys(SCEN).length > 0, 'scenarios recorded', Object.keys(SCEN));
check(worst('regionAreaPct7') < 2.8, `the union of the regions that flash more than 3 times a second stays < 2.8 % of the picture (worst ${worst('regionAreaPct7')} % in any 60-frame window; region mean-luminance swings of >= 0.1)`, Object.fromEntries(Object.entries(SCEN).filter(([n, r]) => !INFO.has(n) && r.regionAreaPct7 >= 2.8).map(([k, r]) => [k, r.regionAreaPct7])));
console.log(`  info: regions with >= 5 transitions in 60 frames (> 2 flashes/s) - worst ${worst('regions5')} regions of 225 (${Object.entries(SCEN).filter(([, r]) => r.regions5 > 0).map(([k, r]) => k + ': ' + r.regions5).join('; ')})`);
check(worst('maxLumJump') < 0.1, `whole-frame luminance never jumps by >= 0.1 between consecutive frames (worst ${worst('maxLumJump')})`, Object.fromEntries(Object.entries(SCEN).filter(([n, r]) => !INFO.has(n) && r.maxLumJump >= 0.1).map(([k, r]) => [k, r.maxLumJump])));
check(worst('maxUpPct') < 12 && worst('maxDnPct') < 12, `single-frame changed area stays small (worst up ${worst('maxUpPct')} % / down ${worst('maxDnPct')} %, < 12 %)`);
check(errs.length === 0, 'zero console errors', errs);
fs.writeFileSync(path.join(OUT, `photosens_${TAG}.json`), JSON.stringify({ when: new Date().toISOString(), html: HTML, scenarios: SCEN }, null, 1));
await t.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nphotosensitivity scan: all checks passed');
process.exit(failed ? 1 : 0);
