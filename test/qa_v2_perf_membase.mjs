// Baseline: PSS of a blank page at the same viewport/DPR (so the game's own share can be separated from the browser's page buffers)
import fs from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { K_VIEWS, sleep } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const pssOf = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'); const m = /Pss:\s+(\d+) kB/.exec(t); return m ? +m[1] : 0; } catch (e) { return 0; } };
const pids = () => { const ps = execSync('ps -eo pid,ppid').toString().trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/).map(Number)); const roots = execSync('pgrep -f playwright_chromiumdev_profile').toString().trim().split('\n').map(Number).filter(Boolean); const kids = new Map(); for (const [p, pp] of ps) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); } const all = new Set(roots), st = roots.slice(); while (st.length) { const p = st.pop(); for (const c of kids.get(p) || []) if (!all.has(c)) { all.add(c); st.push(c); } } return [...all]; };
for (const k of [4, 6, 8]) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.setContent('<canvas id=c width=256 height=224 style="width:' + (k === 4 ? 1024 : 512 * (k / 6) * 2) + 'px"></canvas>');
  await sleep(1500);
  const bc = await browser.newBrowserCDPSession(); const myp = (await bc.send('SystemInfo.getProcessInfo')).processInfo.map((x) => x.id); const by = {}; for (const p of myp) { let ty = 'browser'; try { const m = /--type=([a-z-]+)/.exec(fs.readFileSync(`/proc/${p}/cmdline`, 'utf8')); ty = m ? m[1] : 'browser'; } catch (e) {} by[ty] = (by[ty] || 0) + Math.round(pssOf(p) / 1024); }
  console.log(`blank page ${vw}x${vh}@${dpr}: PSS MB`, JSON.stringify(by));
  await browser.close();
}
