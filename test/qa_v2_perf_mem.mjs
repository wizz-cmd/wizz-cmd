// Memory at k = 4 / 6 / 8: process PSS (all browser processes of this launch), JS heap, GFX cache stats, over: boot -> warm-up -> 2P play -> all 30 rounds -> k steps -> long run
// usage: node mem.mjs [k list] [variant]
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { open, K_VIEWS, BUSY, DRIVE, sleep, OUT, HTML } from './qa_v2_perf_lib.mjs';
const kList = (process.argv[2] || '4,6,8').split(',').map(Number);
const variant = process.argv[3] || 'base';
const pssOf = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'); const m = /Pss:\s+(\d+) kB/.exec(t); return m ? +m[1] : 0; } catch (e) { return 0; } };
const pidsFor = (marker) => {
  try {
    const ps = execSync('ps -eo pid,ppid').toString().trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/).map(Number));
    const roots = execSync(`pgrep -f ${marker}`).toString().trim().split('\n').map(Number).filter(Boolean);
    const kids = new Map(); for (const [pid, ppid] of ps) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid); }
    const all = new Set(roots); const stack = roots.slice();
    while (stack.length) { const p = stack.pop(); for (const c of kids.get(p) || []) if (!all.has(c)) { all.add(c); stack.push(c); } }
    return [...all];
  } catch (e) { return []; }
};
const out = {};
for (const k of kList) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), vw, vh, dpr });
  const snap = async (label) => {
    await t.cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await sleep(300);
    const bcdp = t.__bcdp || (t.__bcdp = await t.browser.newBrowserCDPSession());
    const pids = (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.map((x) => x.id);
    let total = 0, rend = 0; const parts = [];
    for (const pid of pids) { const p = pssOf(pid); total += p; let type = 'browser'; try { const cl = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); const m = /--type=([a-z-]+)/.exec(cl); type = m ? m[1] : 'browser'; } catch (e) {} parts.push([type, p]); if (type === 'renderer') rend += p; }
    const heap = (await t.cdp.send('Runtime.getHeapUsage')).usedSize;
    const st = await t.page.evaluate(() => { const fz = window.__fizzpop; const s = fz.GFX._stats(); return { k: s.k, kb: s.kb, spritePx: s.px, entries: s.entries, worldPx: s.worldPx, levels: s.levels, bgs: s.bgs, tilePx: s.tilePx, strings: s.strings, stringPx: s.stringPx, particles: s.particles, evictions: s.evictions, peakPx: s.peakPx, bakes: s.bakes, big: fz._main.bigHeroes().px }; });
    const byType = {}; for (const [ty, p] of parts) byType[ty] = (byType[ty] || 0) + Math.round(p / 1024);
    const row = { label, byType, totalPssMB: +(total / 1024).toFixed(0), rendererPssMB: +(rend / 1024).toFixed(0), jsHeapMB: +(heap / 1048576).toFixed(1), ...st, spriteMB: +(st.spritePx * 4 / 1048576).toFixed(1), worldMB: +(st.worldPx * 4 / 1048576).toFixed(1), bigMB: +(st.big * 4 / 1048576).toFixed(1) };
    console.log(`k=${st.k} ${label.padEnd(22)} ${JSON.stringify(byType)} PSS total ${String(row.totalPssMB).padStart(4)} MB (renderer ${row.rendererPssMB}) heap ${row.jsHeapMB} MB | sprites ${row.spriteMB} MB (${st.entries}) world ${row.worldMB} MB (${st.levels}L+${st.bgs}B) tiles ${(st.tilePx * 4 / 1048576).toFixed(1)} MB strings ${st.strings}/${(st.stringPx * 4 / 1048576).toFixed(1)}MB particles ${st.particles} heroes ${row.bigMB} MB evict ${st.evictions}`);
    return row;
  };
  const rows = [];
  await t.page.evaluate(() => { window.__fizzpop._main.setQuality(2, true); });
  await sleep(1000);
  rows.push(await snap('boot'));
  await sleep(8000);
  rows.push(await snap('warmed (title, 9 s)'));
  await t.page.evaluate(({ drive }) => { fz = window.__fizzpop; fz.start(2, 1, 11); fz.Game.debug.god(true); const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); }, { drive: DRIVE(false) });
  await sleep(15000);
  rows.push(await snap('2P round 1 (15 s)'));
  // walk every round: start(…, level) for 1..30, 1.2 s each (world canvases for 30 rounds, sprites for every enemy / boss / kraken)
  await t.page.evaluate(() => { fz.freeze(true); });
  for (let lvl = 1; lvl <= 30; lvl++) { await t.page.evaluate((lvl) => { fz.start(2, lvl, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); for (let i = 0; i < 40; i++) fz.step(1); }, lvl); }
  rows.push(await snap('after 30 rounds'));
  // k steps down and up
  const ks = [3, 4, 2, 3, 4, 3, 4];
  for (const kk of ks) { await t.page.evaluate((c) => { fz._main.setKCap(c); for (let i = 0; i < 60; i++) fz.step(1); }, kk); }
  rows.push(await snap('after 7 k steps'));
  await t.page.evaluate(() => { fz._main.setKCap(null); for (let i = 0; i < 60; i++) fz.step(1); });
  await t.page.evaluate(() => { fz.freeze(false); });
  await sleep(20000);
  rows.push(await snap('+20 s play'));
  out[k] = rows;
  await t.close();
}
fs.writeFileSync(OUT + `/mem_${variant}.json`, JSON.stringify(out, null, 1));
